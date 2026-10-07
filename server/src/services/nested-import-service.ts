import type { Core } from "@strapi/strapi";
import { PLUGIN_ID } from "../constants";
import type { ImportResults } from "../types";
import { describeError, mergeResults } from "../utils/import/compare";
import { cleanSheetRows } from "../utils/import/file";

const nestedImportService = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Import a single batch of already-parsed component rows (header→value objects)
   * for one locale, as sent by the admin UI's client-driven chunked nested import.
   * The caller must keep all rows for a given parent identifier within the same
   * batch (the sheet is processed as a full-replace per parent). Stateless: no
   * file, no background work — completes within the request, so it can't exceed a
   * reverse-proxy timeout regardless of source-file size.
   */
  async importComponentBatch(
    rawRows: any[],
    contentType: string,
    componentField: string,
    identifierField: string,
    locale: string | null = null,
    publishOnImport = true
  ): Promise<ImportResults> {
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };

    const attributes = strapi.contentTypes[contentType]?.attributes;
    if (!attributes) {
      results.errors.push(`Content type ${contentType} not found`);
      return results;
    }

    const componentDef = attributes[componentField] as any;
    if (componentDef?.type !== "component" || !componentDef.repeatable) {
      results.errors.push(`"${componentField}" is not a repeatable component field on ${contentType}`);
      return results;
    }

    const rows = cleanSheetRows(Array.isArray(rawRows) ? rawRows : []);
    if (!rows.length) return results;

    try {
      const sheetResult = await this.importComponentSheet(
        rows,
        contentType,
        componentField,
        componentDef.component,
        identifierField,
        locale,
        publishOnImport
      );
      mergeResults(results, sheetResult);
    } catch (err: any) {
      // importComponentSheet rolls its transaction back and rethrows on any parent
      // failure; surface it as a batch error instead of crashing the client loop.
      results.errors.push(err?.message || String(err));
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
    const results: ImportResults = { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };

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

    const importService = strapi.plugin(PLUGIN_ID).service("import-service");

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

          let resolvedComponents = [];
          for (const componentRow of componentRows) {
            const resolved = await importService.resolveComponentRelations(componentRow, componentUid, locale);
            resolvedComponents.push(resolved);
          }

          const existingComponents = parent[componentField] || [];
          resolvedComponents = resolvedComponents.map((comp: any, i: number) => {
            const existingComp = existingComponents[i];
            if (existingComp?.id) return { id: existingComp.id, ...comp };
            return comp;
          });

          await strapi.documents(contentType as any).update({
            documentId: parent.documentId,
            data: { [componentField]: resolvedComponents },
            ...statusParam,
            ...localeParam,
          } as any);

          results.updated++;
        } catch (err: any) {
          const message = `Failed for ${identifierField}="${identifierValue}": ${describeError(err)}`;
          results.errors.push(message);
          results.created = 0;
          results.updated = 0;
          // The batch caller only sees this rethrown error, so carry the detailed message.
          throw new Error(message);
        }
      }
    });

    return results;
  },
});

export default nestedImportService;
