import type { Core } from "@strapi/strapi";
import { getPluginStore, MEDIA_ALT_SUBFIELD, STORE_KEY, SYSTEM_KEYS } from "../constants";
import type { PluginSettings } from "../types";
import { createContentTypeAccess, isManagedContentType, requireContentTypeAccess } from "../utils/access";
import { buildDeepPopulate } from "../utils/export/query";
import { expandEntry, extractSchemaFieldSets, forColumns } from "../utils/export/transform";
import { parseCollectionConfig } from "../utils/settings";

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
      if (!isManagedContentType(strapi, uid)) return ctx.throw(400, `Unknown collection "${uid}"`);
      const patch = parseCollectionConfig(vals);
      if (!patch) return ctx.throw(400, `Invalid settings for collection "${uid}"`);
      merged[uid] = { ...merged[uid], ...patch };
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

    const userAbility = ctx.state?.userAbility;
    if (!userAbility) return ctx.throw(401, "Unauthorized");

    const collections = Object.entries(strapi.contentTypes)
      .filter(([uid]) => uid.startsWith("api::"))
      .map(([uid, schema]: [string, any]) => {
        const access = createContentTypeAccess(strapi, userAbility, uid);
        return { uid, schema, access };
      })
      .map(({ uid, schema, access }) => ({
        uid,
        displayName: schema.info?.displayName ?? uid.split(".").pop(),
        collectionName: schema.collectionName ?? uid.split(".").pop(),
        isLocalized: schema.pluginOptions?.i18n?.localized ?? false,
        exportEnabled: colSettings[uid]?.exportEnabled ?? true,
        importEnabled: colSettings[uid]?.importEnabled ?? true,
        // What the current admin may do, from their Content Manager permissions. Kept apart
        // from exportEnabled/importEnabled, which are the shared plugin settings.
        canExport: access.canRead(),
        canImport: access.canCreate() || access.canUpdate(),
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

  async getCollectionFields(ctx) {
    const { uid } = ctx.params;
    await requireContentTypeAccess(strapi, ctx, uid, "schema");
    const schema = strapi.contentTypes[uid];

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

    const access = await requireContentTypeAccess(strapi, ctx, contentType, "export");
    const schema = strapi.contentTypes[contentType];

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
    // `start` (entry offset) lets the admin download page with a varying `limit`
    const startNum = Math.max(0, parseInt(start, 10) || (pageNum - 1) * limitNum);

    const isLocalized = schema.pluginOptions?.i18n?.localized ?? false;
    const localeParam = isLocalized && locale ? { locale } : {};

    // The caller's read conditions (e.g. "only my entries") narrow both the page and the total
    const query = await access.sanitizedReadQuery({
      populate: buildDeepPopulate(strapi, contentType),
      sort: "id:asc",
      ...localeParam,
    });
    const [found, total] = await Promise.all([
      strapi.documents(contentType as any).findMany({ ...query, limit: limitNum, start: startNum } as any),
      strapi.documents(contentType as any).count({ ...localeParam, filters: query.filters } as any),
    ]);
    const entries = await Promise.all((found ?? []).map((entry) => access.sanitizeOutput(entry)));

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
