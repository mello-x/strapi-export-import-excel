import type { Core } from "@strapi/strapi";
import { getPluginStore, MEDIA_ALT_SUBFIELD, STORE_KEY, SYSTEM_KEYS } from "../constants";
import type { PluginSettings } from "../types";
import { buildDeepPopulate } from "../utils/export/query";
import { expandEntry, extractSchemaFieldSets, forColumns } from "../utils/export/transform";

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
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

    const toLabel = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase());

    const fields = Object.entries(schema.attributes)
      .filter(([key, def]: [string, any]) => !SYSTEM_KEYS.has(key) && !def.customField)
      .flatMap(([key, def]: [string, any]) => {
        if (def.type !== "media") {
          return [{ key, label: toLabel(key), type: def.type }];
        }

        if (def.multiple) return [];
        return [{ key: `${key}.${MEDIA_ALT_SUBFIELD}`, label: `${toLabel(key)} Alt Text`, type: "string" }];
      });

    ctx.body = { fields };
  },

  async getTableData(ctx) {
    const { contentType, page = "1", limit = "10", start, columns, locale } = ctx.query as Record<string, string>;

    if (!contentType) return ctx.throw(400, "contentType is required");

    const schema = strapi.contentTypes[contentType];
    if (!schema) return ctx.throw(404, "Content type not found");

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
    // `start` (entry offset) lets the admin download page with a varying `limit`
    const startNum = Math.max(0, parseInt(start, 10) || (pageNum - 1) * limitNum);

    const isLocalized = schema.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    const [entries, total] = await Promise.all([
      strapi.documents(contentType as any).findMany({
        populate: buildDeepPopulate(strapi, contentType),
        sort: "id:asc",
        limit: limitNum,
        start: startNum,
        ...localeParam,
      }),
      strapi.documents(contentType as any).count({ ...localeParam }),
    ]);

    const requested = columns
      ? columns
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined;
    const fieldSets = forColumns(extractSchemaFieldSets(schema.attributes, strapi), requested);
    const expandedRows = (entries ?? []).flatMap((entry) => expandEntry(entry, fieldSets, strapi));
    const cols = requested ?? Object.keys(expandedRows[0] ?? {});

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
