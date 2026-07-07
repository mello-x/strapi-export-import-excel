import type { Core } from "@strapi/strapi";

const PLUGIN_ID = "strapi-export-import-excel";

function extractFile(ctx: any): any {
  const { files } = ctx.request as any;
  if (!files?.file) {
    ctx.throw(400, "No file provided");
  }
  return Array.isArray(files.file) ? files.file[0] : files.file;
}

function buildImportResponse(result: any): { message: string; result: any; summary: any } {
  const hasErrors = result.errors?.length > 0;
  return {
    message: hasErrors
      ? `Import completed with ${result.errors.length} error(s). Please check the details below.`
      : "Import completed successfully",
    result,
    summary: {
      total: (result.created ?? 0) + (result.updated ?? 0),
      created: result.created ?? 0,
      updated: result.updated ?? 0,
      skipped: result.skipped ?? 0,
      errors: result.errors?.length ?? 0,
    },
  };
}

function handleError(ctx: any, strapi: Core.Strapi, label: string, error: any): void {
  strapi.log.error(`${label}:`, error);
  ctx.body = { error: error.message, details: error.stack };
  ctx.status = 500;
}

const asBool = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
};

const importController = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getImportHeaders(ctx) {
    try {
      const file = extractFile(ctx);
      const importService = strapi.plugin(PLUGIN_ID).service("import-service");
      ctx.body = { headers: await importService.getFileHeaders(file) };
    } catch (error) {
      handleError(ctx, strapi, "Get import headers error", error);
    }
  },

  // Whole-file import (multipart). Kept for direct/programmatic API use. The admin
  // UI imports in batches via `importBatch` to avoid reverse-proxy timeouts.
  async import(ctx) {
    try {
      const file = extractFile(ctx);
      const { body } = ctx.request as any;

      const importService = strapi.plugin(PLUGIN_ID).service("import-service");
      const result = await importService.importData(
        file,
        body.contentType,
        body.locale || null,
        body.identifierField || null,
        body.bulkLocaleUpload === "true",
        body.publishOnImport === "true"
      );

      ctx.body = buildImportResponse(result);
    } catch (error) {
      handleError(ctx, strapi, "Import error", error);
    }
  },

  // Whole-file nested/component import (multipart). Kept for direct/programmatic
  // API use; the admin UI uses `importComponentBatch`.
  async importComponent(ctx) {
    try {
      const file = extractFile(ctx);
      const { body } = ctx.request as any;

      if (!body.contentType || !body.componentField || !body.identifierField) {
        return ctx.throw(400, "contentType, componentField, and identifierField are required");
      }

      const nestedImportService = strapi.plugin(PLUGIN_ID).service("nested-import-service");
      const result = await nestedImportService.importComponentData(
        file,
        body.contentType,
        body.componentField,
        body.identifierField,
        body.locale || null,
        body.bulkLocaleUpload === "true"
      );

      ctx.body = buildImportResponse(result);
    } catch (error) {
      handleError(ctx, strapi, "Component import error", error);
    }
  },

  // Stateless batch import: the admin UI parses the Excel in the browser and posts
  // rows in small chunks (JSON). Each request fully completes on its own, so a
  // large import can never be killed by a reverse-proxy / load-balancer timeout.
  async importBatch(ctx) {
    try {
      const { rows, contentType, locale, identifierField, publishOnImport } = (ctx.request as any).body ?? {};

      if (!contentType) return ctx.throw(400, "contentType is required");
      if (!Array.isArray(rows)) return ctx.throw(400, "rows must be an array");

      const importService = strapi.plugin(PLUGIN_ID).service("import-service");
      const result = await importService.importBatch(
        rows,
        contentType,
        locale || null,
        identifierField || null,
        asBool(publishOnImport)
      );

      ctx.body = buildImportResponse(result);
    } catch (error) {
      handleError(ctx, strapi, "Import batch error", error);
    }
  },

  // Stateless batch nested import. The caller must send all rows for a given parent
  // identifier within the same batch (the component array is replaced per parent).
  async importComponentBatch(ctx) {
    try {
      const { rows, contentType, componentField, identifierField, locale, publishOnImport } =
        (ctx.request as any).body ?? {};

      if (!contentType || !componentField || !identifierField) {
        return ctx.throw(400, "contentType, componentField, and identifierField are required");
      }
      if (!Array.isArray(rows)) return ctx.throw(400, "rows must be an array");

      const nestedImportService = strapi.plugin(PLUGIN_ID).service("nested-import-service");
      const result = await nestedImportService.importComponentBatch(
        rows,
        contentType,
        componentField,
        identifierField,
        locale || null,
        asBool(publishOnImport, true)
      );

      ctx.body = buildImportResponse(result);
    } catch (error) {
      handleError(ctx, strapi, "Component import batch error", error);
    }
  },
});

export default importController;
