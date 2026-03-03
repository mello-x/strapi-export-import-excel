import type { Core } from "@strapi/strapi";
import * as XLSX from "xlsx";

const getPluginStore = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "strapi-export-import-excel" });

const SYSTEM_KEYS = [
  "documentId",
  "locale",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "createdBy",
  "updatedBy",
  "localizations",
  "status",
];

const SHORTCUT_FIELDS = ["email", "businessEmail", "name", "title", "tickerCode"];

const exportService = ({ strapi }: { strapi: Core.Strapi }) => ({
  async exportData(
    format: string = "json",
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

    for (const ct of contentTypes) {
      try {
        const parsedFilters = this.parseFilters(rawFilters);

        if (rawFilters._q) {
          parsedFilters._q = rawFilters._q;
        }

        let filters = parsedFilters.filters;

        const searchable = this.getSearchableFields(strapi.contentTypes[ct]);
        const numberSearchable = this.getNumberFields(strapi.contentTypes[ct]);

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

        const isLocalized = strapi.contentTypes[ct]?.pluginOptions?.i18n?.localized ?? false;
        const localeParam = isLocalized && locale ? { locale } : {};

        const entries = await strapi.documents(ct as any).findMany({
          filters: { ...filters },
          populate: "*",
          ...localeParam,
        });

        if (entries && entries.length > 0) {
          exportData.data[ct] = entries;
        }
      } catch (error) {
        strapi.log.error(`Failed to export ${ct}:`, error);
      }
    }

    if (format === "excel") {
      const stored = (await getPluginStore(strapi).get({ key: "settings" })) as any;
      const fieldConfig: Record<string, { exportFields?: { key: string; enabled: boolean }[] }> =
        stored?.collections ?? {};
      return this.convertToExcel(exportData.data, fieldConfig, columnsOverride);
    }

    return exportData;
  },

  getSearchableFields(contentTypeSchema: any): string[] {
    return Object.entries<any>(contentTypeSchema.attributes)
      .filter(
        ([name, attr]) =>
          ["string", "text", "richtext", "email", "uid", "enumeration"].includes(attr.type) && name !== "locale"
      )
      .map(([name]) => name);
  },

  getNumberFields(contentTypeSchema: any): string[] {
    return [
      ...Object.entries<any>(contentTypeSchema.attributes)
        .filter(([, attr]) => ["number", "integer", "biginteger", "float", "decimal"].includes(attr.type))
        .map(([name]) => name),
      "id",
    ];
  },

  parseFilters(filters: Record<string, any>): Record<string, any> {
    const parsed: Record<string, any> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (["page", "pageSize", "sort", "locale", "format", "contentType", "_q"].includes(key)) {
        continue;
      }

      if (key.startsWith("filters[")) {
        const match = key.match(/filters\[([^\]]+)\](?:\[(\d+)\])?\[([^\]]+)\](?:\[([^\]]+)\])?/);
        if (match) {
          const [, operator, index, field, condition] = match;
          if (!parsed.filters) parsed.filters = {};

          if (operator === "$and") {
            if (!parsed.filters.$and) parsed.filters.$and = [];
            const idx = parseInt(index, 10) || 0;
            if (!parsed.filters.$and[idx]) parsed.filters.$and[idx] = {};

            if (condition) {
              if (!parsed.filters.$and[idx][field]) parsed.filters.$and[idx][field] = {};
              parsed.filters.$and[idx][field][condition] = value;
            } else {
              parsed.filters.$and[idx][field] = value;
            }
          }
        }
      } else {
        parsed[key] = value;
      }
    }
    return parsed;
  },

  convertToExcel(
    data: Record<string, any[]>,
    fieldConfig: Record<string, { exportFields?: { key: string; enabled: boolean }[] }> = {},
    columnsOverride?: string
  ): Buffer {
    const workbook = XLSX.utils.book_new();
    let hasData = false;

    for (const [contentType, entries] of Object.entries(data)) {
      const sheetName = contentType
        .split(".")
        .pop()
        ?.replace(/[^\w\s-]/gi, "_")
        .substring(0, 31);

      const attr = strapi.contentTypes[contentType]?.attributes || {};
      const customFields = Object.entries<any>(attr)
        .filter(([, def]) => def.customField)
        .map(([key]) => key);
      const relationFields = Object.entries<any>(attr)
        .filter(([, def]) => def.type === "relation")
        .map(([key]) => key);
      const skipFields = Object.entries<any>(attr)
        .filter(([, def]) => def.type === "media")
        .map(([key]) => key);
      const componentFields = Object.entries<any>(attr)
        .filter(([, def]) => def.type === "component")
        .map(([key]) => key);

      function handleObject(key: string, value: any): any {
        if (!value) return undefined;
        if (relationFields.includes(key)) {
          for (const field of SHORTCUT_FIELDS) {
            if (value[field]) return value[field];
          }
        }
        return undefined;
      }

      // Recursively flatten a component object into prefix_key columns
      function flattenComp(obj: any, prefix: string): Record<string, any> {
        const flat: Record<string, any> = {};
        if (!obj || typeof obj !== "object") return flat;
        for (const [field, fieldValue] of Object.entries(obj)) {
          if (field === "id" || field === "__component") continue;
          const colKey = `${prefix}_${field}`;
          if (fieldValue === null || fieldValue === undefined) {
            flat[colKey] = null;
          } else if (Array.isArray(fieldValue)) {
            flat[colKey] = JSON.stringify(fieldValue);
          } else if (typeof fieldValue === "object") {
            Object.assign(flat, flattenComp(fieldValue, colKey));
          } else {
            flat[colKey] = fieldValue;
          }
        }
        return flat;
      }

      function cleanAndFlatten(obj: any): any {
        if (Array.isArray(obj)) {
          return obj.map(cleanAndFlatten);
        } else if (obj !== null && typeof obj === "object") {
          const result: Record<string, any> = {};
          for (const key in obj) {
            const value = obj[key];
            if (SYSTEM_KEYS.includes(key)) continue;
            if (customFields.includes(key)) continue;
            if ([...skipFields, "wishlist", "availableSlot"].includes(key)) continue;

            if (componentFields.includes(key)) {
              if (Array.isArray(value)) {
                // Repeatable component → JSON string (round-trippable on import)
                result[key] = JSON.stringify(value.map(({ id, __component, ...rest }: any) => rest));
              } else if (value && typeof value === "object") {
                // Single component → recursive flatten into prefix_subField columns
                Object.assign(result, flattenComp(value, key));
              }
              continue;
            }

            if (value === null || typeof value !== "object") {
              result[key] = value;
              continue;
            }

            if (!Array.isArray(value)) {
              const temp = handleObject(key, value);
              if (temp !== undefined) result[key] = temp;
              continue;
            }

            // value is an array
            if (value.length > 0 && typeof value[0] === "object") {
              result[key] = value.map((item) => handleObject(key, item)).filter(Boolean);
            } else {
              result[key] = value;
            }
          }
          return result;
        } else {
          return obj;
        }
      }

      function flattenForXLSX(obj: Record<string, any>): Record<string, any> {
        return Object.fromEntries(
          Object.entries(obj).map(([col, colValue]) => [col, Array.isArray(colValue) ? colValue.join("|") : colValue])
        );
      }

      if (entries && entries.length > 0) {
        hasData = true;

        // columnsOverride (from query param) takes priority over stored field config
        let enabledKeys: string[] | undefined;
        if (columnsOverride) {
          enabledKeys = columnsOverride
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
        } else {
          const config = fieldConfig[contentType];
          enabledKeys = config?.exportFields
            ?.filter((exportField) => exportField.enabled)
            .map((exportField) => exportField.key);
        }

        const cleaned = entries.map((entry) => {
          const flat = flattenForXLSX(cleanAndFlatten(entry));
          if (!enabledKeys) return flat;
          const ordered: Record<string, any> = {};
          for (const key of enabledKeys) {
            if (key in flat) ordered[key] = flat[key];
          }
          return ordered;
        });

        const worksheet = enabledKeys
          ? XLSX.utils.json_to_sheet(cleaned, { header: enabledKeys })
          : XLSX.utils.json_to_sheet(cleaned);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      } else {
        const worksheet = XLSX.utils.json_to_sheet([{ message: "No data found" }]);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        hasData = true;
      }
    }

    if (!hasData) {
      const worksheet = XLSX.utils.json_to_sheet([{ message: "No data to export" }]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "NoData");
    }

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  },

  async exportSingleEntry(contentType: string, entryId: string): Promise<Buffer> {
    const entry = await strapi.documents(contentType as any).findFirst({
      filters: { id: { $eq: entryId } } as any,
      populate: "*",
    });

    if (!entry) {
      throw new Error("Entry not found");
    }

    return this.convertToExcel({ [contentType]: [entry] });
  },
});

export default exportService;
