import type { Core } from "@strapi/strapi";

function extractFile(ctx: any): any {
  const { files } = ctx.request as any;
  if (!files || !files.file) {
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

const importController = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getImportHeaders(ctx) {
    try {
      const file = extractFile(ctx);
      const importService = strapi.plugin("strapi-export-import-excel").service("import-service");
      ctx.body = { headers: await importService.getFileHeaders(file) };
    } catch (error) {
      handleError(ctx, strapi, "Get import headers error", error);
    }
  },

  async import(ctx) {
    try {
      const file = extractFile(ctx);
      const { body } = ctx.request as any;

      const importService = strapi.plugin("strapi-export-import-excel").service("import-service");
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

  async importComponent(ctx) {
    try {
      const file = extractFile(ctx);
      const { body } = ctx.request as any;

      if (!body.contentType || !body.componentField || !body.identifierField) {
        return ctx.throw(400, "contentType, componentField, and identifierField are required");
      }

      const nestedImportService = strapi.plugin("strapi-export-import-excel").service("nested-import-service");
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
});

export default importController;
