import type { Core } from "@strapi/strapi";
import * as XLSX from "xlsx";
import { getPluginStore, STORE_KEY } from "../constants";
import type { CollectionConfig, PluginSettings } from "../types";
import { buildDeepPopulate } from "../utils/export/query";
import { expandEntry, extractSchemaFieldSets, forColumns } from "../utils/export/transform";

const exportService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async exportData(contentType: string, columnsOverride?: string, locale?: string) {
    const schema = strapi.contentTypes[contentType];
    if (!schema) {
      throw new Error(`Content type ${contentType} not found`);
    }

    const isLocalized = schema.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    const entries = await strapi.documents(contentType as any).findMany({
      populate: buildDeepPopulate(strapi, contentType),
      sort: "id:asc",
      ...localeParam,
    });

    const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as PluginSettings | null;
    return this.convertToExcel(contentType, entries ?? [], stored?.collections?.[contentType], columnsOverride);
  },

  convertToExcel(contentType: string, entries: any[], config?: CollectionConfig, columnsOverride?: string): Buffer {
    const workbook = XLSX.utils.book_new();
    const sheetName = contentType
      .split(".")
      .pop()
      ?.replace(/[^\w\s-]/gi, "_")
      .substring(0, 31);

    const attributes = strapi.contentTypes[contentType]?.attributes || {};
    const fieldSets = extractSchemaFieldSets(attributes, strapi);

    let enabledKeys: string[] | undefined;
    if (columnsOverride) {
      enabledKeys = columnsOverride
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
    } else {
      const rawEnabled = config?.exportFields
        ?.filter((exportField) => exportField.enabled)
        .map((exportField) => exportField.key);
      if (rawEnabled && rawEnabled.length > 0) {
        enabledKeys = [];
        for (const key of rawEnabled) {
          if (fieldSets.repeatableColumns[key]) {
            enabledKeys.push(...fieldSets.repeatableColumns[key]);
          } else {
            enabledKeys.push(key);
          }
        }
      }
    }

    const allRows = entries.flatMap((entry) => expandEntry(entry, forColumns(fieldSets, enabledKeys), strapi));

    const finalRows = allRows.map((row) => {
      if (!enabledKeys) return row;
      const ordered: Record<string, any> = {};
      for (const key of enabledKeys) {
        if (key in row) ordered[key] = row[key];
      }
      return ordered;
    });

    const worksheet = enabledKeys
      ? XLSX.utils.json_to_sheet(finalRows, { header: enabledKeys })
      : XLSX.utils.json_to_sheet(finalRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  },
});

export default exportService;
