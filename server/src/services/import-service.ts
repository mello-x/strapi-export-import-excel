import type { Core } from "@strapi/strapi";
import * as XLSX from "xlsx";
import {
  cleanSheetRows,
  cleanupFile,
  getComponentFieldNames,
  getFileInfo,
  getMediaAltFieldNames,
  getRelationFieldDefs,
  hasChanges,
  type ImportBatch,
  type ImportResults,
  MEDIA_ALT_KEY,
  mergeComponentData,
  mergeResults,
  parseJsonIfNeeded,
  parseMediaAltColumn,
  SHORTCUT_FIELDS,
  setNestedPath,
  sheetToJson,
} from "../utils/import";

const importService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileHeaders(file: any): Promise<string[]> {
    const { filePath } = getFileInfo(file, "unknown.xlsx");

    try {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
      return (rows[0] ?? []).map((h: any) => String(h).trim());
    } finally {
      cleanupFile(filePath);
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
    const { filePath } = getFileInfo(file, "unknown.xlsx");

    try {
      if (bulkLocaleUpload && targetContentType) {
        const batches = this.transformExcelDataByLocale(filePath, targetContentType);
        return await this.bulkInsertBatches(batches, identifierField, publishOnImport);
      }
      const importData = this.transformExcelData(filePath, targetContentType);
      return await this.bulkInsertData(importData, locale, identifierField, publishOnImport);
    } catch (error) {
      cleanupFile(filePath);
      throw error;
    }
  },

  /**
   * Import a single batch of already-parsed sheet rows (header→value objects),
   * as sent by the admin UI's client-driven chunked import. Stateless: no file,
   * no background work — each call fully completes within the request, so it can
   * never exceed a reverse-proxy timeout no matter how large the source file is.
   */
  async importBatch(
    rawRows: any[],
    contentType: string,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false
  ): Promise<ImportResults> {
    if (!strapi.contentTypes[contentType]) {
      return { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [`Content type ${contentType} not found`] };
    }
    const rows = cleanSheetRows(Array.isArray(rawRows) ? rawRows : []);
    const entries = this.unflattenRows(rows, contentType);
    return this.importEntries(entries, contentType, locale, identifierField, publishOnImport);
  },

  transformExcelData(filePath: string, targetContentType: string | null = null): Record<string, any[]> {
    const workbook = XLSX.readFile(filePath);
    const importData: Record<string, any[]> = {};

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = sheetToJson(worksheet);
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

  transformExcelDataByLocale(filePath: string, targetContentType: string): ImportBatch[] {
    const workbook = XLSX.readFile(filePath);
    const batches: ImportBatch[] = [];

    if (!strapi.contentTypes[targetContentType]) {
      strapi.log.error(`Content type ${targetContentType} not found`);
      return batches;
    }

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = sheetToJson(worksheet);
      if (!rows.length) return;

      batches.push({
        contentType: targetContentType,
        locale: sheetName,
        entries: this.unflattenRows(rows, targetContentType),
      });
    });

    return batches;
  },

  unflattenRows(rows: any[], ctName: string): any[] {
    const attributes = strapi.contentTypes[ctName]?.attributes || {};

    const compFieldDefs = Object.entries<any>(attributes)
      .filter(([, def]) => def.type === "component")
      .map(([name, def]) => ({ name, repeatable: !!def.repeatable }));
    const mediaAltFields = getMediaAltFieldNames(attributes);

    return rows.map((row) => {
      const rowData: Record<string, any> = {};

      for (const [key, rawValue] of Object.entries(row)) {
        const value = rawValue === "" || rawValue === undefined ? null : rawValue;

        const mediaField = parseMediaAltColumn(key, mediaAltFields);
        if (mediaField) {
          if (!rowData[MEDIA_ALT_KEY]) rowData[MEDIA_ALT_KEY] = {};
          rowData[MEDIA_ALT_KEY][mediaField] = value;
          continue;
        }

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
        } else if (
          attributes[key] &&
          (attributes[key] as any).customField &&
          (attributes[key] as any).default === "[]"
        ) {
          rowData[key] = String(value).split("|");
        } else {
          rowData[key] = parseJsonIfNeeded(value);
        }
      }

      return rowData;
    });
  },

  async resolveRelationValue(
    value: any,
    target: string,
    locale: string | null = null
  ): Promise<{ documentId: string } | null> {
    const targetAttr = strapi.contentTypes[target]?.attributes;
    if (!targetAttr) return null;

    const targetIsLocalized = (strapi.contentTypes[target] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = targetIsLocalized && locale ? { locale } : {};

    let lookupField: string | null = null;
    let lookupValue: any = null;

    if (typeof value === "string" && value.includes(":")) {
      const colonIdx = value.indexOf(":");
      lookupField = value.slice(0, colonIdx);
      lookupValue = value.slice(colonIdx + 1);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length > 0) {
        lookupField = keys[0];
        lookupValue = value[keys[0]];
      }
    }

    if (lookupField && lookupValue != null) {
      if (!(targetAttr as any)[lookupField]) {
        throw new Error(`Field "${lookupField}" does not exist on ${target}`);
      }
      const existing = await strapi.documents(target as any).findFirst({
        filters: { [lookupField]: { $eq: lookupValue } } as any,
        ...localeParam,
      } as any);
      if (existing) return { documentId: existing.documentId };
      throw new Error(
        `Record with ${lookupField} "${lookupValue}" not found in ${target}${locale ? ` (locale: ${locale})` : ""}`
      );
    }

    if (typeof value === "string") {
      for (const shortcut of SHORTCUT_FIELDS) {
        if (!(targetAttr as any)[shortcut]) continue;
        const existing = await strapi.documents(target as any).findFirst({
          filters: { [shortcut]: { $eq: value } } as any,
          ...localeParam,
        } as any);
        if (existing) return { documentId: existing.documentId };
        throw new Error(
          `Record with ${shortcut} "${value}" not found in ${target}${locale ? ` (locale: ${locale})` : ""}`
        );
      }
    }

    return null;
  },

  async handleRelations(
    entry: Record<string, any>,
    contentType: string,
    locale: string | null = null
  ): Promise<Record<string, any>> {
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const relationFields = getRelationFieldDefs(attributes);
    if (relationFields.length === 0) return entry;

    const updatedEntry = { ...entry };

    for (const rel of relationFields) {
      const { field, target, relation } = rel;

      // A column absent from the sheet means "leave this relation alone"; only a column
      // that is present and empty clears it. Without this distinction a narrow sheet
      // (e.g. sku + banner.alternativeText) silently wipes every relation it omits,
      // and reports the wipe as a successful "updated".
      if (!(field in entry)) continue;

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
        const resolved = await this.resolveRelationValue(relValue, target, locale);
        if (resolved) processed.push(resolved);
      }
      updatedEntry[field] = Array.isArray(value) ? processed : processed[0];
    }

    return updatedEntry;
  },

  async resolveComponentRelations(
    componentData: any,
    componentUid: string,
    locale: string | null = null
  ): Promise<any> {
    const compSchema = (strapi as any).components?.[componentUid];
    if (!compSchema?.attributes) return componentData;

    if (Array.isArray(componentData)) {
      const resolved = [];
      for (const item of componentData) {
        resolved.push(await this.resolveComponentRelations(item, componentUid, locale));
      }
      return resolved;
    }

    if (!componentData || typeof componentData !== "object") return componentData;

    const result = { ...componentData };

    for (const [fieldName, attr] of Object.entries<any>(compSchema.attributes)) {
      if (!(fieldName in result) || result[fieldName] == null || result[fieldName] === "") continue;

      if (attr.type === "relation") {
        const target = attr.target;
        const isArrayRelation = attr.relation === "manyToMany" || attr.relation === "oneToMany";
        let value = result[fieldName];

        if (typeof value === "string" && isArrayRelation) {
          value = value.split("|");
        }

        const values = Array.isArray(value) ? value : [value];
        const processed: any[] = [];
        for (const relValue of values) {
          if (!relValue || relValue === "") continue;
          const resolved = await this.resolveRelationValue(relValue, target, locale);
          if (resolved) processed.push(resolved);
        }
        result[fieldName] = isArrayRelation || Array.isArray(value) ? processed : (processed[0] ?? null);
      } else if (attr.type === "component") {
        result[fieldName] = await this.resolveComponentRelations(result[fieldName], attr.component, locale);
      }
    }

    return result;
  },

  async handleComponentRelations(
    entry: Record<string, any>,
    contentType: string,
    locale: string | null = null
  ): Promise<Record<string, any>> {
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const updatedEntry = { ...entry };

    for (const [fieldName, def] of Object.entries<any>(attributes)) {
      if (def.type !== "component") continue;
      if (!updatedEntry[fieldName]) continue;

      updatedEntry[fieldName] = await this.resolveComponentRelations(updatedEntry[fieldName], def.component, locale);
    }

    return updatedEntry;
  },

  async bulkInsertData(
    importData: Record<string, any[]>,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false
  ) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };

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

  async bulkInsertBatches(batches: ImportBatch[], identifierField: string | null = null, publishOnImport = false) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };

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

  /**
   * Writes `<mediaField>.alternativeText` values onto the *files* the entry's media
   * fields point at, via the upload plugin. The document service cannot do this: it
   * reads a media field as "which file to link", not as that file's metadata.
   *
   * Called outside the `hasChanges` gate in importEntries by design. A row carrying
   * only alt text produces no entry-level diff, so gating this on an entry write
   * would make every such row a silent no-op.
   *
   * A blank cell means "leave unchanged", matching updateFileInfo's nil semantics.
   */
  async applyMediaAltText(
    mediaAltValues: Record<string, any>,
    entry: any,
    results: ImportResults,
    rowNumber: number
  ): Promise<void> {
    const pending = Object.entries(mediaAltValues).filter(([, value]) => value != null && String(value).trim() !== "");
    if (pending.length === 0) return;

    if (!entry) {
      results.errors.push(`Row ${rowNumber}: alt text given but the entry was created, so no file is linked yet`);
      return;
    }

    const uploadService = strapi.plugin("upload").service("upload");

    for (const [field, rawValue] of pending) {
      const alternativeText = String(rawValue).trim();
      const file = entry[field];

      if (!file?.id) {
        results.errors.push(`Row ${rowNumber}: "${field}" has no file attached — alt text skipped`);
        continue;
      }
      if (file.alternativeText === alternativeText) continue;

      await uploadService.updateFileInfo(file.id, { alternativeText });
      results.mediaUpdated++;
    }
  },

  async importEntries(
    entries: any[],
    contentType: string,
    locale: string | null = null,
    identifierField: string | null = null,
    publishOnImport = false
  ) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };
    const attributes = strapi.contentTypes[contentType]?.attributes ?? {};
    const compFields = getComponentFieldNames(attributes);

    const isLocalized = (strapi.contentTypes[contentType] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};
    const statusParam = publishOnImport ? { status: "published" as const } : {};

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      try {
        if (identifierField && identifierField !== "id") {
          const identifierValue = entry[identifierField];
          if (identifierValue == null || (typeof identifierValue === "string" && !identifierValue.trim())) {
            results.skipped++;
            continue;
          }
        }

        let existing: any = null;
        const { id, [MEDIA_ALT_KEY]: mediaAltValues, ...rawData } = entry;

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

        let data = await this.handleRelations(rawData, contentType, locale);
        data = await this.handleComponentRelations(data, contentType, locale);
        data = mergeComponentData(data, existing, compFields);

        // The entry the row's media alt text applies to, if any. Set wherever we
        // matched an existing document; stays null when the row creates one.
        let mediaEntry: any = null;

        if (existing) {
          mediaEntry = existing;
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
          const existingAnyLocale = await strapi.documents(contentType as any).findFirst({
            filters: { [identifierField]: { $eq: entry[identifierField] } } as any,
            populate: "*",
          } as any);
          if (existingAnyLocale) {
            mediaEntry = existingAnyLocale;
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

        // Outside the hasChanges gate on purpose — see applyMediaAltText.
        if (mediaAltValues) {
          await this.applyMediaAltText(mediaAltValues, mediaEntry, results, i + 2);
        }
      } catch (err: any) {
        const errorMsg = err?.message || err?.details?.errors?.[0]?.message || JSON.stringify(err);
        strapi.log.error(`Row ${i + 2} failed: ${errorMsg}`, err?.details || err);
        results.errors.push(`Row ${i + 2}: ${errorMsg}`);
        results.skipped++;
      }
    }

    return results;
  },
});

export default importService;
