import type { Core } from "@strapi/strapi";
import type { ExportField, PluginSettings } from "../types";
import { buildDeepPopulate, buildQuery, expandEntry, extractSchemaFieldSets, validateFilter } from "../utils/export";
import { SYSTEM_KEYS } from "../utils/import";

const STORE_KEY = "settings";

const SYSTEM_KEYS_SET = new Set(SYSTEM_KEYS);

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

    const existing = (await getPluginStore(strapi).get({ key: STORE_KEY })) as PluginSettings | null;
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
    const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as PluginSettings | null;
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
        ([key, def]: [string, any]) => !SYSTEM_KEYS_SET.has(key) && !SKIP_TYPES.includes(def.type) && !def.customField
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

    let rawEnabledFields: string[] | null = null;
    if (!columns) {
      const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as PluginSettings | null;
      const exportFields: ExportField[] = stored?.collections?.[contentType]?.exportFields ?? [];
      if (exportFields.length > 0) {
        rawEnabledFields = exportFields
          .filter((exportField) => exportField.enabled)
          .map((exportField) => exportField.key);
      }
    }

    const isLocalized = schema.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    const validatedFilters = validateFilter({}, schema.attributes);
    const deepPopulate = buildDeepPopulate(strapi, contentType);
    const query = buildQuery(validatedFilters, limitNum, (pageNum - 1) * limitNum, deepPopulate);

    const [entries, total] = await Promise.all([
      strapi.documents(contentType as any).findMany({
        ...query,
        ...localeParam,
      }),
      strapi.documents(contentType as any).count({ ...localeParam }),
    ]);

    const fieldSets = extractSchemaFieldSets(schema.attributes, strapi);
    const expandedRows = (entries ?? []).flatMap((entry) => expandEntry(entry, fieldSets, SYSTEM_KEYS_SET, strapi));

    let cols: string[];
    if (columns) {
      cols = columns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    } else if (rawEnabledFields) {
      const allFlatKeys = expandedRows.length > 0 ? Object.keys(expandedRows[0]) : [];
      cols = [];
      for (const raw of rawEnabledFields) {
        if (fieldSets.repeatableColumns[raw]) {
          cols.push(...fieldSets.repeatableColumns[raw]);
        } else {
          const matching = allFlatKeys.filter((flatKey) => flatKey === raw || flatKey.startsWith(`${raw}_`));
          cols.push(...matching);
        }
      }
      if (cols.length === 0) cols = allFlatKeys;
    } else {
      cols = expandedRows.length > 0 ? Object.keys(expandedRows[0]) : [];
    }

    const resultData = expandedRows.map((row) => {
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
