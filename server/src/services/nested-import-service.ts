import type { Core } from "@strapi/strapi";
import ExcelJS from "exceljs";
import { worksheetToJson } from "../utils/excel";
import { cleanupFile, getFileInfo, type ImportResults, mergeResults } from "../utils/import";

const nestedImportService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async importComponentData(
    file: any,
    contentType: string,
    componentField: string,
    identifierField: string,
    locale: string | null = null,
    bulkLocaleUpload = false,
    publishOnImport = true
  ) {
    const { fileExtension, filePath } = getFileInfo(file);

    if (fileExtension !== "xlsx" && fileExtension !== "xls") {
      throw new Error("Component import only supports Excel files");
    }

    const attributes = strapi.contentTypes[contentType]?.attributes;
    if (!attributes) throw new Error(`Content type ${contentType} not found`);

    const componentDef = attributes[componentField] as any;
    if (!componentDef || componentDef.type !== "component" || !componentDef.repeatable) {
      throw new Error(`"${componentField}" is not a repeatable component field on ${contentType}`);
    }

    const componentUid = componentDef.component;
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      if (bulkLocaleUpload) {
        for (const worksheet of workbook.worksheets) {
          const rows: Record<string, any>[] = worksheetToJson(worksheet);
          if (!rows.length) continue;

          const sheetResult = await this.importComponentSheet(
            rows,
            contentType,
            componentField,
            componentUid,
            identifierField,
            worksheet.name,
            publishOnImport
          );
          mergeResults(results, sheetResult);
        }
      } else {
        const worksheet = workbook.worksheets[0];
        const rows: Record<string, any>[] = worksheet ? worksheetToJson(worksheet) : [];

        if (!rows.length) {
          results.errors.push("No data found in file");
          return results;
        }

        const sheetResult = await this.importComponentSheet(
          rows,
          contentType,
          componentField,
          componentUid,
          identifierField,
          locale,
          publishOnImport
        );
        mergeResults(results, sheetResult);
      }
    } finally {
      cleanupFile(filePath);
    }

    return results;
  },

  async importComponentSheet(
    rows: Record<string, any>[],
    contentType: string,
    componentField: string,
    componentUid: string,
    identifierField: string,
    locale: string | null,
    publishOnImport: boolean
  ) {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, errors: [] };

    const grouped: Record<string, Record<string, any>[]> = {};
    for (const row of rows) {
      const idValue = row[identifierField];
      if (idValue == null || String(idValue).trim() === "") continue;
      const key = String(idValue);
      if (!grouped[key]) grouped[key] = [];
      const { [identifierField]: _, ...componentData } = row;
      grouped[key].push(componentData);
    }

    const isLocalized = (strapi.contentTypes[contentType] as any)?.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};
    const statusParam = publishOnImport ? { status: "published" as const } : {};

    const importService = strapi.plugin("strapi-export-import-excel").service("import-service");

    await strapi.db.transaction(async ({ onRollback }) => {
      onRollback(() => {
        strapi.log.error("Component import transaction rolled back:", results.errors);
      });

      for (const [identifierValue, componentRows] of Object.entries(grouped)) {
        try {
          const parent = await strapi.documents(contentType as any).findFirst({
            filters: { [identifierField]: { $eq: identifierValue } } as any,
            populate: "*",
            ...localeParam,
          } as any);

          if (!parent) {
            results.errors.push(
              `Parent not found: ${identifierField}="${identifierValue}"${locale ? ` (locale: ${locale})` : ""}`
            );
            results.skipped++;
            continue;
          }

          const resolvedComponents = [];
          for (const componentRow of componentRows) {
            const resolved = await importService.resolveComponentRelations(componentRow, componentUid, locale);
            resolvedComponents.push(resolved);
          }

          const existingComponents = (parent[componentField] || []).map((comp: any) => ({ id: comp.id }));
          const mergedComponents = [...existingComponents, ...resolvedComponents];

          await strapi.documents(contentType as any).update({
            documentId: parent.documentId,
            data: { [componentField]: mergedComponents },
            ...statusParam,
            ...localeParam,
          } as any);

          results.updated++;
        } catch (err: any) {
          results.errors.push(`Failed for ${identifierField}="${identifierValue}": ${err.message}`);
          results.created = 0;
          results.updated = 0;
          throw err;
        }
      }
    });

    return results;
  },
});

export default nestedImportService;
