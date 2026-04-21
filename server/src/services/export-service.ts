import type { Core } from "@strapi/strapi";
import ExcelJS from "exceljs";
import type { CollectionConfig, PluginSettings } from "../types";
import { addJsonToWorksheet } from "../utils/excel";
import {
  buildDeepPopulate,
  buildQuery,
  expandEntry,
  extractSchemaFieldSets,
  getNumberFields,
  getSearchableFields,
  parseFilters,
  validateFilter,
} from "../utils/export";
import { SYSTEM_KEYS } from "../utils/import";

const getPluginStore = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "strapi-export-import-excel" });

const exportService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async exportData(
    contentType: string | null = null,
    rawFilters: Record<string, any> = {},
    columnsOverride?: string,
    locale?: string
  ) {
    let contentTypes: string[];
    if (contentType) {
      if (!strapi.contentTypes[contentType]) {
        throw new Error(`Content type ${contentType} not found`);
      }
      contentTypes = [contentType];
    } else {
      contentTypes = Object.keys(strapi.contentTypes).filter((key) => key.startsWith("api::"));
    }

    const exportData: Record<string, any> = {
      version: strapi.config.get("info.strapi"),
      timestamp: new Date().toISOString(),
      data: {},
    };

    for (const currentContentType of contentTypes) {
      try {
        const parsedFilters = parseFilters(rawFilters);

        if (rawFilters._q) {
          parsedFilters._q = rawFilters._q;
        }

        let filters = parsedFilters.filters;

        const searchable = getSearchableFields(strapi.contentTypes[currentContentType]);
        const numberSearchable = getNumberFields(strapi.contentTypes[currentContentType]);

        if (parsedFilters._q) {
          const orConditions: any[] = [];

          if (searchable.length > 0) {
            orConditions.push(...searchable.map((field) => ({ [field]: { $containsi: parsedFilters._q } })));
          }

          if (numberSearchable.length > 0 && !Number.isNaN(parsedFilters._q)) {
            orConditions.push(...numberSearchable.map((field) => ({ [field]: { $eq: Number(parsedFilters._q) } })));
          }

          if (orConditions.length > 0) {
            filters = {
              ...filters,
              $and: [...(filters?.$and || []), { $or: orConditions }],
            };
          }
        }

        const schema = strapi.contentTypes[currentContentType];
        const validatedFilters = validateFilter(filters ?? {}, schema.attributes);

        const isLocalized = schema?.pluginOptions?.i18n?.localized ?? false;
        const localeParam = isLocalized && locale ? { locale } : {};

        const deepPopulate = buildDeepPopulate(strapi, currentContentType);
        const query = buildQuery(validatedFilters, undefined, undefined, deepPopulate);

        const entries = await strapi.documents(currentContentType as any).findMany({
          ...query,
          ...localeParam,
        });

        if (entries && entries.length > 0) {
          exportData.data[currentContentType] = entries;
        }
      } catch (error) {
        strapi.log.error(`Failed to export ${currentContentType}:`, error);
      }
    }

    const stored = (await getPluginStore(strapi).get({ key: "settings" })) as PluginSettings | null;
    const fieldConfig: Record<string, CollectionConfig> = stored?.collections ?? {};
    return await this.convertToExcel(exportData.data, fieldConfig, columnsOverride);
  },

  async convertToExcel(
    data: Record<string, any[]>,
    fieldConfig: Record<string, CollectionConfig> = {},
    columnsOverride?: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    let hasData = false;

    for (const [contentType, entries] of Object.entries(data)) {
      const sheetName = contentType
        .split(".")
        .pop()
        ?.replace(/[^\w\s-]/gi, "_")
        .substring(0, 31);

      const attributes = strapi.contentTypes[contentType]?.attributes || {};
      const fieldSets = extractSchemaFieldSets(attributes, strapi);

      if (entries && entries.length > 0) {
        hasData = true;

        let enabledKeys: string[] | undefined;
        if (columnsOverride) {
          enabledKeys = columnsOverride
            .split(",")
            .map((column) => column.trim())
            .filter(Boolean);
        } else {
          const config = fieldConfig[contentType];
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

        const allRows = entries.flatMap((entry) => expandEntry(entry, fieldSets, SYSTEM_KEYS, strapi));

        const finalRows = allRows.map((row) => {
          if (!enabledKeys) return row;
          const ordered: Record<string, any> = {};
          for (const key of enabledKeys) {
            if (key in row) ordered[key] = row[key];
          }
          return ordered;
        });

        const worksheet = workbook.addWorksheet(sheetName);
        addJsonToWorksheet(worksheet, finalRows, enabledKeys);
      } else {
        const worksheet = workbook.addWorksheet(sheetName);
        addJsonToWorksheet(worksheet, [{ message: "No data found" }]);
        hasData = true;
      }
    }

    if (!hasData) {
      const worksheet = workbook.addWorksheet("NoData");
      addJsonToWorksheet(worksheet, [{ message: "No data to export" }]);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  },

  async exportSingleEntry(contentType: string, entryId: string): Promise<Buffer> {
    const deepPopulate = buildDeepPopulate(strapi, contentType);
    const entry = await strapi.documents(contentType as any).findFirst({
      filters: { id: { $eq: entryId } } as any,
      populate: deepPopulate,
    });

    if (!entry) {
      throw new Error("Entry not found");
    }

    return await this.convertToExcel({ [contentType]: [entry] });
  },
});

export default exportService;
