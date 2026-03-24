import * as fs from "node:fs";
import type { Core } from "@strapi/strapi";
import * as XLSX from "xlsx";
import {
  hasChanges,
  type ImportBatch,
  type ImportResults,
  mergeResults,
  parseJsonIfNeeded,
  SHORTCUT_FIELDS,
  setNestedPath,
  toCamel,
} from "../utils/import-utils";

const importService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileHeaders(file: any): Promise<string[]> {
    const fileName = file.name || file.originalFilename || "unknown.json";
    const fileExtension = fileName.split(".").pop().toLowerCase();
    const filePath = file.path || file.filepath;

    if (!filePath) throw new Error("File path not found");

    try {
      if (fileExtension === "json") {
        const content = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(content);
        const first = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]?.[0];
        return Object.keys(first ?? {});
      } else if (fileExtension === "xlsx" || fileExtension === "xls") {
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

  async importData(
    file: any,
    targetContentType: string | null = null,
    locale: string | null = null,
    identifierField: string | null = null,
    bulkLocaleUpload = false,
    publishOnImport = false
  ) {
    const fileName = file.name || file.originalFilename || "unknown.json";
    const fileExtension = fileName.split(".").pop().toLowerCase();
    const filePath = file.path || file.filepath;

    if (!filePath) {
      throw new Error("File path not found");
    }

    try {
      if (fileExtension === "json") {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const importData: Record<string, any[]> = JSON.parse(fileContent);
        return await this.bulkInsertData(importData, locale, identifierField, publishOnImport);
      } else if (fileExtension === "xlsx" || fileExtension === "xls") {
        if (bulkLocaleUpload && targetContentType) {
          const batches = this.transformExcelDataByLocale(filePath, targetContentType);
          return await this.bulkInsertBatches(batches, identifierField, publishOnImport);
        }
        const importData = this.transformExcelData(filePath, targetContentType);
        return await this.bulkInsertData(importData, locale, identifierField, publishOnImport);
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } catch (error) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  },

  // Normal mode: sheet name = content type (or use targetContentType override)
  transformExcelData(filePath: string, targetContentType: string | null = null): Record<string, any[]> {
    const workbook = XLSX.readFile(filePath);
    const importData: Record<string, any[]> = {};

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      if (!rows.length) return;

      const ctName = targetContentType || `api::${sheetName}.${sheetName}`;

      if (!ctName.startsWith("api::")) {
        strapi.log.error(`Unknown content-type: ${ctName}`);
        return;
      }
      if (!strapi.contentTypes[ctName]) {
        strapi.log.error(`Content type ${ctName} not found`);
        return;
      }

      importData[ctName] = this.unflattenRows(rows, ctName);
    });

    return importData;
  },

  // Bulk locale mode: sheet name = locale code, targetContentType required
  transformExcelDataByLocale(filePath: string, targetContentType: string): ImportBatch[] {
    const workbook = XLSX.readFile(filePath);
    const batches: ImportBatch[] = [];

    if (!strapi.contentTypes[targetContentType]) {
      strapi.log.error(`Content type ${targetContentType} not found`);
      return batches;
    }

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      if (!rows.length) return;

      batches.push({
        contentType: targetContentType,
        locale: sheetName,
        entries: this.unflattenRows(rows, targetContentType),
      });
    });

    return batches;
  },

  // Shared row-unflattening logic used by both transform methods
  unflattenRows(rows: any[], ctName: string): any[] {
    const attr = strapi.contentTypes[ctName]?.attributes || {};

    const compFieldDefs = Object.entries<any>(attr)
      .filter(([, def]) => def.type === "component")
      .map(([name, def]) => ({ name, repeatable: !!def.repeatable }));

    return rows.map((row) => {
      const rowData: Record<string, any> = {};

      for (const [key, rawValue] of Object.entries(row)) {
        const value = rawValue === "" || rawValue === undefined ? null : rawValue;

        const compDef = compFieldDefs.find((c) => key === c.name || key.startsWith(`${c.name}_`));

        if (compDef) {
          if (key === compDef.name) {
            if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
              try {
                rowData[compDef.name] = JSON.parse(value);
              } catch {
                rowData[compDef.name] = null;
              }
            } else {
              rowData[compDef.name] = value;
            }
          } else {
            if (!rowData[compDef.name]) rowData[compDef.name] = {};
            const subPath = key.slice(compDef.name.length + 1);
            setNestedPath(rowData[compDef.name], subPath, value);
          }
          continue;
        }

        if (value === null) {
          rowData[key] = null;
        } else if (attr[key] && (attr[key] as any).customField && (attr[key] as any).default === "[]") {
          rowData[key] = String(value).split("|");
        } else {
          rowData[key] = parseJsonIfNeeded(value);
        }
      }

      return rowData;
    });
  },

  getRelationFields(contentType: string) {
    return Object.entries<any>(strapi.contentTypes[contentType]?.attributes ?? {})
      .filter(([, attr]) => attr.type === "relation")
      .map(([fieldName, attr]) => ({ field: toCamel(fieldName), target: attr.target, relation: attr.relation }));
  },

  getComponentFields(contentType: string): string[] {
    return Object.entries<any>(strapi.contentTypes[contentType]?.attributes ?? {})
      .filter(([, attr]) => attr.type === "component")
      .map(([fieldName]) => toCamel(fieldName));
  },

  async handleRelations(
    entry: Record<string, any>,
    contentType: string,
    locale: string | null = null
  ): Promise<Record<string, any>> {
    const resolveRelationValue = async (_field: string, value: any, target: string) => {
      const targetAttr = strapi.contentTypes[target].attributes;
      const targetIsLocalized = (strapi.contentTypes[target] as any)?.pluginOptions?.i18n?.localized ?? false;
      const localeParam = targetIsLocalized && locale ? { locale } : {};

      for (const shortcut of SHORTCUT_FIELDS) {
        if (!(targetAttr as any)[shortcut]) continue;
        const existing = await strapi.documents(target as any).findFirst({
          filters: { [shortcut]: { $eq: value } } as any,
          ...localeParam,
        } as any);
        if (existing) return { documentId: existing.documentId };
        throw new Error(
          `Data with ${shortcut} "${value}" not found in ${target}${locale ? ` (locale: ${locale})` : ""}`
        );
      }
      return null;
    };

    const relationFields = this.getRelationFields(contentType);
    if (relationFields.length === 0) return entry;

    const updatedEntry = { ...entry };

    for (const rel of relationFields) {
      const { field, target, relation } = rel;
      let value = entry[field];

      if (!value || value === "") {
        updatedEntry[field] = relation === "manyToMany" || relation === "oneToMany" ? [] : null;
        continue;
      }

      if (typeof value === "string" && (relation === "manyToMany" || relation === "oneToMany")) {
        value = value.split("|");
      } else if (typeof value === "string" && value.includes("|")) {
        throw new Error(`Invalid value for field ${field}: ${value} — not an array relation`);
      }

      const values = Array.isArray(value) ? value : [value];
      const processed: any[] = [];
      for (const relValue of values) {
        if (!relValue || relValue === "") continue;
        const resolved = await resolveRelationValue(field, relValue, target);
        if (resolved) processed.push(resolved);
      }
      updatedEntry[field] = Array.isArray(value) ? processed : processed[0];
    }

    return updatedEntry;
  },

  handleComponents(
    data: Record<string, any>,
    existing: Record<string, any> | null,
    contentType: string
  ): Record<string, any> {
    const compFields = this.getComponentFields(contentType);

    for (const field of compFields) {
      const newValue = data[field];
      const oldValue = existing?.[field];

      if (!newValue || !oldValue) continue;

      if (!Array.isArray(newValue)) {
        if (oldValue?.id) data[field].id = oldValue.id;
        for (const key of Object.keys(data[field])) {
          if (Array.isArray(oldValue[key])) {
            data[field][key] = String(data[field][key]).split("|");
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
              block[key] = String(block[key]).split("|");
            }
          }
          return block;
        });
      }
    }

    return data;
  },

  // Normal mode: single locale for all batches
  async bulkInsertData(
    importData: Record<string, any[]>,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false
  ) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, errors: [] };

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
        mergeResults(results, await this.importEntries(entries, contentType, locale, identifierField, publishOnImport));
      } catch (err: any) {
        results.errors.push(err.message);
      }
    }

    return results;
  },

  // Bulk locale mode: each batch carries its own locale
  async bulkInsertBatches(batches: ImportBatch[], identifierField: string | null = null, publishOnImport = false) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const { contentType, locale, entries } of batches) {
      if (!strapi.contentTypes[contentType]) {
        results.errors.push(`Content type ${contentType} not found`);
        continue;
      }

      try {
        mergeResults(results, await this.importEntries(entries, contentType, locale, identifierField, publishOnImport));
      } catch (err: any) {
        results.errors.push(`[${locale}] ${err.message}`);
      }
    }

    return results;
  },

  async importEntries(
    entries: any[],
    contentType: string,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false
  ) {
    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    const isLocalized = (strapi.contentTypes[contentType] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};
    const statusParam = publishOnImport ? { status: "published" as const } : {};

    await strapi.db.transaction(async ({ rollback: _rollback, onRollback }) => {
      onRollback(() => {
        strapi.log.error("Transaction rolled back:", results.errors);
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let existing: any = null;

        try {
          let { id, ...data } = entry;

          if (identifierField && identifierField !== "id") {
            const identifierValue = entry[identifierField];
            if (identifierValue == null || (typeof identifierValue === "string" && !identifierValue.trim())) {
              strapi.log.info(`Skipping row ${i + 2}: empty identifier field "${identifierField}"`);
              results.skipped++;
              continue;
            }
          }

          if (identifierField && identifierField !== "id" && entry[identifierField] != null) {
            existing = await strapi.documents(contentType as any).findFirst({
              filters: { [identifierField]: { $eq: entry[identifierField] } } as any,
              populate: "*",
              ...localeParam,
            } as any);
          } else if (id && id !== "null" && id !== "undefined") {
            existing = await strapi.documents(contentType as any).findFirst({
              filters: { id } as any,
              populate: "*",
              ...localeParam,
            } as any);
          }

          data = await this.handleRelations(data, contentType, locale);
          data = this.handleComponents(data, existing, contentType);

          if (existing) {
            const needsPublish = publishOnImport && existing.publishedAt == null;
            if (hasChanges(existing, data) || needsPublish) {
              await strapi.documents(contentType as any).update({
                documentId: existing.documentId,
                data,
                ...statusParam,
                ...localeParam,
              } as any);
              results.updated++;
            }
          } else if (locale && identifierField && identifierField !== "id" && entry[identifierField] != null) {
            // In bulk locale mode, check if the document exists in any other locale so we can
            // add this locale to the same document instead of creating a new unlinked one.
            const existingAnyLocale = await strapi.documents(contentType as any).findFirst({
              filters: { [identifierField]: { $eq: entry[identifierField] } } as any,
              populate: "*",
            } as any);
            if (existingAnyLocale) {
              await strapi.documents(contentType as any).update({
                documentId: existingAnyLocale.documentId,
                data,
                ...statusParam,
                ...localeParam,
              } as any);
              results.updated++;
            } else {
              await strapi.documents(contentType as any).create({
                data,
                ...statusParam,
                ...localeParam,
              } as any);
              results.created++;
            }
          } else {
            await strapi.documents(contentType as any).create({
              data,
              ...statusParam,
              ...localeParam,
            } as any);
            results.created++;
          }
        } catch (err: any) {
          results.errors.push(`Failed ${existing ? "updating" : "creating"} on row ${i + 2}: ${err.message}`);
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
