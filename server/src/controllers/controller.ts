import type { Core } from "@strapi/strapi";
import { buildQuery, validateFilter } from "../utils/export-utils";

const STORE_KEY = "settings";

const SYSTEM_KEYS = new Set([
  "documentId",
  "locale",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "createdBy",
  "updatedBy",
  "localizations",
  "status",
]);

const SHORTCUT_FIELDS = ["name", "title", "email", "displayName", "businessEmail"];

const getPluginStore = (strapi: Core.Strapi) => strapi.store({ type: "plugin", name: "strapi-export-import-excel" });

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  index(ctx) {
    ctx.body = strapi.plugin("strapi-export-import-excel").service("service").getWelcomeMessage();
  },

  async getSettings(ctx) {
    const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as {
      collections: Record<string, { exportEnabled: boolean; importEnabled: boolean }>;
    } | null;

    ctx.body = { collections: stored?.collections ?? {} };
  },

  async updateSettings(ctx) {
    const { collections } = ctx.request.body as {
      collections: Record<string, object>;
    };

    if (!collections || typeof collections !== "object" || Array.isArray(collections)) {
      return ctx.throw(400, "`collections` must be an object");
    }

    const existing = (await getPluginStore(strapi).get({ key: STORE_KEY })) as any;
    const merged: Record<string, any> = { ...existing?.collections };
    for (const [uid, vals] of Object.entries(collections)) {
      merged[uid] = { ...merged[uid], ...(vals as object) };
    }

    await getPluginStore(strapi).set({
      key: STORE_KEY,
      value: { collections: merged },
    });

    ctx.body = { collections: merged };
  },

  async getCollections(ctx) {
    const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as any;
    const colSettings = stored?.collections ?? {};

    const collections = Object.entries(strapi.contentTypes)
      .filter(([uid]) => uid.startsWith("api::"))
      .map(([uid, schema]: [string, any]) => ({
        uid,
        displayName: schema.info?.displayName ?? uid.split(".").pop(),
        collectionName: schema.collectionName ?? uid.split(".").pop(),
        isLocalized: schema.pluginOptions?.i18n?.localized ?? false,
        exportEnabled: colSettings[uid]?.exportEnabled ?? true,
        importEnabled: colSettings[uid]?.importEnabled ?? true,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    ctx.body = { collections };
  },

  async getLocales(ctx) {
    try {
      const dbFallback = () => strapi.db.query("plugin::i18n.locale" as any).findMany({});
      const localesService = strapi.plugin("i18n")?.service("locales");
      const locales: any[] = localesService ? await localesService.find().catch(dbFallback) : await dbFallback();
      ctx.body = {
        locales: locales.map((l: any) => ({ code: l.code, name: l.name, isDefault: l.isDefault ?? false })),
      };
    } catch {
      ctx.body = { locales: [] };
    }
  },

  getCollectionFields(ctx) {
    const { uid } = ctx.params;
    const schema = strapi.contentTypes[uid];
    if (!schema) return ctx.throw(404, "Content type not found");

    const SKIP_TYPES = ["media"];

    const fields = Object.entries(schema.attributes)
      .filter(
        ([key, def]: [string, any]) => !SYSTEM_KEYS.has(key) && !SKIP_TYPES.includes(def.type) && !def.customField
      )
      .map(([key, def]: [string, any]) => ({
        key,
        label: key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase()),
        type: def.type,
      }));

    ctx.body = { fields };
  },

  async getTableData(ctx) {
    const { contentType, page = "1", limit = "10", columns, locale } = ctx.query as Record<string, string>;

    if (!contentType) return ctx.throw(400, "contentType is required");

    const schema = strapi.contentTypes[contentType];
    if (!schema) return ctx.throw(404, "Content type not found");

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);

    // When no explicit columns, load raw enabled fields from settings
    let rawEnabledFields: string[] | null = null;
    if (!columns) {
      const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as any;
      const exportFields = stored?.collections?.[contentType]?.exportFields;
      if (exportFields && exportFields.length > 0) {
        rawEnabledFields = exportFields
          .filter((exportField: any) => exportField.enabled)
          .map((exportField: any) => exportField.key);
      }
    }

    const isLocalized = schema.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    const validatedFilters = validateFilter({}, schema.attributes);
    const query = buildQuery(validatedFilters, limitNum, (pageNum - 1) * limitNum);

    // Fetch paginated entries and total count
    const [entries, total] = await Promise.all([
      strapi.documents(contentType as any).findMany({
        ...query,
        ...localeParam,
      }),
      strapi.documents(contentType as any).count({ ...localeParam }),
    ]);

    // Build schema-derived field lists for flattening
    const attr = schema.attributes;
    const componentFieldDefs = Object.entries<any>(attr)
      .filter(([, def]) => def.type === "component")
      .map(([key, def]) => ({ key, repeatable: !!def.repeatable }));
    const relationFieldKeys = Object.entries<any>(attr)
      .filter(([, def]) => def.type === "relation")
      .map(([key]) => key);
    const skipFieldKeys = Object.entries<any>(attr)
      .filter(([, def]) => def.type === "media" || def.customField)
      .map(([key]) => key);

    // Recursively flatten a component object into prefix_subField columns
    function flattenComp(obj: any, prefix: string): Record<string, any> {
      const flat: Record<string, any> = {};
      if (!obj || typeof obj !== "object") return flat;
      for (const [field, fieldValue] of Object.entries(obj)) {
        if (field === "id" || field === "__component") continue;
        const colKey = `${prefix}_${field}`;
        if (fieldValue === null || fieldValue === undefined) flat[colKey] = null;
        else if (Array.isArray(fieldValue)) flat[colKey] = JSON.stringify(fieldValue);
        else if (typeof fieldValue === "object") Object.assign(flat, flattenComp(fieldValue, colKey));
        else flat[colKey] = fieldValue;
      }
      return flat;
    }

    // Flatten one entry using the same logic as export-service
    function flattenEntry(entry: any): Record<string, any> {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(entry)) {
        if (SYSTEM_KEYS.has(key) || skipFieldKeys.includes(key)) continue;

        const compDef = componentFieldDefs.find((c) => c.key === key);
        if (compDef) {
          if (compDef.repeatable || Array.isArray(value)) {
            result[key] = value
              ? JSON.stringify((value as any[]).map(({ id, __component, ...rest }: any) => rest))
              : null;
          } else if (value && typeof value === "object") {
            Object.assign(result, flattenComp(value as any, key));
          }
          continue;
        }

        if (relationFieldKeys.includes(key)) {
          if (!value) {
            result[key] = null;
            continue;
          }
          if (Array.isArray(value)) {
            result[key] = (value as any[])
              .map((item: any) => {
                for (const field of SHORTCUT_FIELDS) if (item[field] !== undefined) return item[field];
                return null;
              })
              .filter(Boolean)
              .join(", ");
          } else {
            let display: any = null;
            for (const shortcut of SHORTCUT_FIELDS) {
              if ((value as any)[shortcut] !== undefined) {
                display = (value as any)[shortcut];
                break;
              }
            }
            result[key] = display;
          }
          continue;
        }

        if (value === null || value === undefined) {
          result[key] = null;
          continue;
        }
        if (Array.isArray(value)) {
          result[key] = (value as any[]).join("|");
          continue;
        }
        result[key] = value;
      }
      return result;
    }

    const flattenedEntries = (entries ?? []).map(flattenEntry);

    // Determine final columns
    let cols: string[];
    if (columns) {
      // Explicit flattened columns from ColumnSorter — use as-is
      cols = columns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    } else if (rawEnabledFields) {
      // Expand raw field names (e.g. 'address') to all matching flattened keys (e.g. 'address_street', 'address_city')
      const allFlatKeys = flattenedEntries.length > 0 ? Object.keys(flattenedEntries[0]) : [];
      cols = allFlatKeys.filter((flatKey) =>
        rawEnabledFields?.some((raw) => flatKey === raw || flatKey.startsWith(`${raw}_`))
      );
      if (cols.length === 0) cols = allFlatKeys;
    } else {
      // No settings: return all flattened keys from the first entry
      cols = flattenedEntries.length > 0 ? Object.keys(flattenedEntries[0]) : [];
    }

    // Filter each row to only the requested columns
    const resultData = flattenedEntries.map((row) => {
      const filtered: Record<string, any> = {};
      for (const col of cols) {
        filtered[col] = col in row ? row[col] : null;
      }
      return filtered;
    });

    ctx.body = {
      data: resultData,
      total,
      page: pageNum,
      limit: limitNum,
      columns: cols,
    };
  },
});

export default controller;
