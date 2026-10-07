import type { Core } from "@strapi/strapi";
import { PLUGIN_ID } from "../constants";

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
  // ctx.throw() errors (4xx validation) keep their own status and message
  if (error.expose) throw error;
  strapi.log.error(`${label}:`, error);
  // Set directly, not thrown: Strapi replaces thrown 5xx messages with "Internal Server Error".
  // No stack in the body; it's in the server log.
  ctx.body = { error: error.message };
  ctx.status = 500;
}

const asBool = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
};

const importController = ({ strapi }: { strapi: Core.Strapi }) => ({
  // Stateless batch import: the admin UI parses the Excel in the browser and posts
  // rows in small chunks (JSON). Each request fully completes on its own, so a
  // large import can never be killed by a reverse-proxy / load-balancer timeout.
  async importBatch(ctx) {
    try {
      const { rows, contentType, locale, identifierField, publishOnImport, startRow } = (ctx.request as any).body ?? {};

      if (!contentType) return ctx.throw(400, "contentType is required");
      if (!Array.isArray(rows)) return ctx.throw(400, "rows must be an array");

      const importService = strapi.plugin(PLUGIN_ID).service("import-service");
      const result = await importService.importBatch(
        rows,
        contentType,
        locale || null,
        identifierField || null,
        asBool(publishOnImport),
        Number(startRow) || 2
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
