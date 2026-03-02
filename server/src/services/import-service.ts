import type { Core } from '@strapi/strapi';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const SYSTEM_KEYS = [
  'documentId',
  'locale',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy',
  'localizations',
  'status',
];

const SHORTCUT_FIELDS = ['email', 'businessEmail', 'name', 'title', 'tickerCode'];

function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const importService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileHeaders(file: any): Promise<string[]> {
    const fileName = file.name || file.originalFilename || 'unknown.json';
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const filePath = file.path || file.filepath;

    if (!filePath) throw new Error('File path not found');

    try {
      if (fileExtension === 'json') {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        const first = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]?.[0];
        return Object.keys(first ?? {});
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        return (rows[0] ?? []).map(String);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  },

  async importData(file: any, targetContentType: string | null = null, locale: string | null = null, identifierField: string | null = null) {
    const fileName = file.name || file.originalFilename || 'unknown.json';
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const filePath = file.path || file.filepath;

    if (!filePath) {
      throw new Error('File path not found');
    }

    let importData: Record<string, any[]>;

    try {
      if (fileExtension === 'json') {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        importData = JSON.parse(fileContent);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        importData = this.transformExcelData(filePath, targetContentType);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      return await this.bulkInsertData(importData, locale, identifierField);
    } catch (error) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  },

  transformExcelData(filePath: string, targetContentType: string | null = null): Record<string, any[]> {
    const workbook = XLSX.readFile(filePath);
    const importData: Record<string, any[]> = {};

    const parseJsonIfNeeded = (value: any): any => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    };

    // Recursively set a value at a nested path split by '_'
    const setNestedPath = (obj: Record<string, any>, path: string, value: any): void => {
      const idx = path.indexOf('_');
      if (idx === -1) {
        obj[path] = value;
      } else {
        const key = path.slice(0, idx);
        const rest = path.slice(idx + 1);
        if (!obj[key] || typeof obj[key] !== 'object') obj[key] = {};
        setNestedPath(obj[key], rest, value);
      }
    };

    const unflattenRow = (rows: any[], ctName: string): any[] => {
      const attr = strapi.contentTypes[ctName]?.attributes || {};

      // Identify component fields and whether they're repeatable
      const compFieldDefs = Object.entries<any>(attr)
        .filter(([, def]) => def.type === 'component')
        .map(([name, def]) => ({ name, repeatable: !!def.repeatable }));

      return rows.map((row) => {
        const rowData: Record<string, any> = {};

        for (const [key, rawValue] of Object.entries(row)) {
          const value = rawValue === '' || rawValue === undefined ? null : rawValue;

          // Check if this column belongs to a component field (exact or flattened sub-path)
          const compDef = compFieldDefs.find(
            (c) => key === c.name || key.startsWith(`${c.name}_`)
          );

          if (compDef) {
            if (key === compDef.name) {
              // The component column itself — repeatable components stored as JSON
              if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
                try { rowData[compDef.name] = JSON.parse(value); } catch { rowData[compDef.name] = null; }
              } else {
                rowData[compDef.name] = value;
              }
            } else {
              // Flattened single component: compName_subPath
              if (!rowData[compDef.name]) rowData[compDef.name] = {};
              const subPath = key.slice(compDef.name.length + 1);
              setNestedPath(rowData[compDef.name], subPath, value);
            }
            continue;
          }

          // Regular field
          if (value === null) {
            rowData[key] = null;
          } else if (
            attr[key] &&
            (attr[key] as any).customField &&
            (attr[key] as any).default === '[]'
          ) {
            rowData[key] = String(value).split('|');
          } else {
            rowData[key] = parseJsonIfNeeded(value);
          }
        }

        return rowData;
      });
    };

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      if (!rows.length) return;

      const ctName = targetContentType || `api::${sheetName}.${sheetName}`;

      if (!ctName.startsWith('api::')) {
        strapi.log.error(`Unknown content-type: ${ctName}`);
        return;
      }

      if (!strapi.contentTypes[ctName]) {
        strapi.log.error(`Content type ${ctName} not found`);
        return;
      }

      importData[ctName] = unflattenRow(rows, ctName);
    });

    return importData;
  },

  getRelationFields(contentType: string) {
    return Object.entries<any>(strapi.contentTypes[contentType]?.attributes ?? {})
      .filter(([, attr]) => attr.type === 'relation')
      .map(([fieldName, attr]) => ({ field: toCamel(fieldName), target: attr.target, relation: attr.relation }));
  },

  getComponentFields(contentType: string): string[] {
    return Object.entries<any>(strapi.contentTypes[contentType]?.attributes ?? {})
      .filter(([, attr]) => attr.type === 'component')
      .map(([fieldName]) => toCamel(fieldName));
  },

  async handleRelations(entry: Record<string, any>, contentType: string): Promise<Record<string, any>> {
    const resolveRelationValue = async (field: string, value: any, target: string) => {
      const targetAttr = strapi.contentTypes[target].attributes;
      for (const shortcut of SHORTCUT_FIELDS) {
        if (!(targetAttr as any)[shortcut]) continue;
        const existing = await strapi.documents(target as any).findFirst({
          filters: { [shortcut]: { $eq: value } } as any,
        });
        if (existing) return { id: existing.id };
        throw new Error(`Data with ${shortcut} "${value}" not found in ${target}`);
      }
      return null;
    };

    const relationFields = this.getRelationFields(contentType);
    if (relationFields.length === 0) return entry;

    const updatedEntry = { ...entry };

    for (const rel of relationFields) {
      const { field, target, relation } = rel;
      let value = entry[field];

      if (!value || value === '') {
        updatedEntry[field] =
          relation === 'manyToMany' || relation === 'oneToMany' ? [] : null;
        continue;
      }

      if (
        typeof value === 'string' &&
        (relation === 'manyToMany' || relation === 'oneToMany')
      ) {
        value = value.split('|');
      } else if (typeof value === 'string' && value.includes('|')) {
        throw new Error(`Invalid value for field ${field}: ${value} — not an array relation`);
      }

      const values = Array.isArray(value) ? value : [value];
      const processed: any[] = [];
      for (const relValue of values) {
        if (!relValue || relValue === '') continue;
        const resolved = await resolveRelationValue(field, relValue, target);
        if (resolved) processed.push(resolved);
      }
      updatedEntry[field] = Array.isArray(value) ? processed : processed[0];
    }

    return updatedEntry;
  },

  handleComponents(data: Record<string, any>, existing: Record<string, any> | null, contentType: string): Record<string, any> {
    const compFields = this.getComponentFields(contentType);

    for (const field of compFields) {
      const newValue = data[field];
      const oldValue = existing?.[field];

      if (!newValue || !oldValue) continue;

      if (!Array.isArray(newValue)) {
        if (oldValue?.id) data[field].id = oldValue.id;
        for (const key of Object.keys(data[field])) {
          if (Array.isArray(oldValue[key])) {
            data[field][key] = String(data[field][key]).split('|');
          }
        }
        continue;
      }

      if (Array.isArray(newValue) && Array.isArray(oldValue)) {
        data[field] = newValue.map((block: any, i: number) => {
          const oldBlock = oldValue[i];
          if (oldBlock?.id) return { id: oldBlock.id, ...block };
          for (const key of Object.keys(block)) {
            if (Array.isArray(oldBlock?.[key])) {
              block[key] = String(block[key]).split('|');
            }
          }
          return block;
        });
      }
    }

    return data;
  },

  hasChanges(existing: Record<string, any>, incoming: Record<string, any>): boolean {
    if (!incoming || typeof incoming !== 'object') return false;
    if (!existing || typeof existing !== 'object') return true;

    for (const key of Object.keys(incoming)) {
      if (SYSTEM_KEYS.includes(key)) continue;
      const newVal = incoming[key];
      const oldVal = existing[key];

      if (oldVal === undefined || newVal === undefined) continue;

      if (newVal === null || typeof newVal !== 'object') {
        if (oldVal !== newVal) return true;
        continue;
      }

      if (Array.isArray(newVal)) {
        if (!Array.isArray(oldVal)) return true;
        if (newVal.length !== oldVal.length) return true;
        for (let i = 0; i < newVal.length; i++) {
          if (
            typeof newVal[i] === 'object' &&
            typeof oldVal[i] === 'object' &&
            this.hasChanges(oldVal[i], newVal[i])
          ) {
            return true;
          } else if (
            typeof newVal[i] !== 'object' &&
            typeof oldVal[i] !== 'object' &&
            newVal[i] !== oldVal[i]
          ) {
            return true;
          }
        }
        continue;
      }

      if (typeof newVal === 'object' && typeof oldVal === 'object') {
        if (this.hasChanges(oldVal, newVal)) return true;
        continue;
      }
    }
    return false;
  },

  async bulkInsertData(importData: Record<string, any[]>, locale: string | null = null, identifierField: string | null = null) {
    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const [contentType, entries] of Object.entries(importData)) {
      if (!strapi.contentTypes[contentType]) {
        results.errors.push(`Content type ${contentType} not found`);
        continue;
      }
      if (!Array.isArray(entries)) {
        results.errors.push(`Invalid data format for ${contentType}`);
        continue;
      }

      try {
        const { created, updated, skipped, errors } = await this.importEntries(entries, contentType, locale, identifierField);
        results.created += created;
        results.updated += updated;
        results.skipped += skipped;
        results.errors = results.errors.concat(errors);
      } catch (err: any) {
        results.errors.push(err.message);
      }
    }

    return results;
  },

  async importEntries(entries: any[], contentType: string, locale: string | null = null, identifierField: string | null = null) {
    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    const isLocalized = (strapi.contentTypes[contentType] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    await strapi.db.transaction(async ({ trx, rollback: _rollback, onRollback }) => {
      onRollback(() => {
        strapi.log.error('Transaction rolled back:', results.errors);
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let existing: any = null;

        try {
          let { id, ...data } = entry;

          // Skip rows where the identifier field is empty/null
          if (identifierField && identifierField !== 'id') {
            const identifierValue = entry[identifierField];
            if (identifierValue == null || (typeof identifierValue === 'string' && !identifierValue.trim())) {
              strapi.log.info(`Skipping row ${i + 2}: empty identifier field "${identifierField}"`);
              results.skipped++;
              continue;
            }
          }

          if (identifierField && identifierField !== 'id' && entry[identifierField] != null) {
            existing = await strapi.documents(contentType as any).findFirst({
              filters: { [identifierField]: { $eq: entry[identifierField] } } as any,
              populate: '*',
              ...localeParam,
            } as any);
          } else if (id && id !== 'null' && id !== 'undefined') {
            existing = await strapi.documents(contentType as any).findFirst({
              filters: { id } as any,
              populate: '*',
              ...localeParam,
            } as any);
          }

          data = await this.handleRelations(data, contentType);
          data = this.handleComponents(data, existing, contentType);

          if (existing) {
            if (this.hasChanges(existing, data)) {
              await strapi.documents(contentType as any).update({
                documentId: existing.documentId,
                data,
                ...localeParam,
              } as any);
              results.updated++;
            }
          } else {
            await strapi.documents(contentType as any).create({
              data,
              ...localeParam,
            } as any);
            results.created++;
          }
        } catch (err: any) {
          results.errors.push(
            `Failed ${existing ? 'updating' : 'creating'} on row ${i + 2}: ${err.message}`
          );
          results.created = 0;
          results.updated = 0;
          throw err;
        }
      }
    });

    return results;
  },
});

export default importService;
