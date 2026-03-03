import type { Core } from "@strapi/strapi";

const importController = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getImportHeaders(ctx) {
    try {
      const { files } = ctx.request as any;

      if (!files || !files.file) {
        return ctx.throw(400, "No file provided");
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;

      const importService = strapi.plugin("strapi-export-import-excel").service("import-service");

      const headers = await importService.getFileHeaders(file);
      ctx.body = { headers };
    } catch (error) {
      strapi.log.error("Get import headers error:", error);
      ctx.body = { error: error.message };
      ctx.status = 500;
    }
  },

  async import(ctx) {
    try {
      const { files, body } = ctx.request as any;

      if (!files || !files.file) {
        return ctx.throw(400, "No file provided");
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      const targetContentType = body.contentType;
      const locale = body.locale || null;
      const identifierField = body.identifierField || null;

      const importService = strapi.plugin("strapi-export-import-excel").service("import-service");

      const result = await importService.importData(file, targetContentType, locale, identifierField);

      let message = "Import completed successfully";
      if (result.errors && result.errors.length > 0) {
        message = `Import completed with ${result.errors.length} error(s). Please check the details below.`;
      }

      ctx.body = {
        message,
        result,
        summary: {
          total: result.created + result.updated,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors.length,
        },
      };
    } catch (error) {
      strapi.log.error("Import error:", error);
      ctx.body = {
        error: error.message,
        details: error.stack,
      };
      ctx.status = 500;
    }
  },
});

export default importController;
