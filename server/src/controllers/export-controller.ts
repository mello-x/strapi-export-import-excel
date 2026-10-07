import type { Core } from "@strapi/strapi";
import { PLUGIN_ID } from "../constants";

const EXCEL_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const today = () => new Date().toISOString().split("T")[0];
const ctBase = (ct: string | undefined) => (ct as string)?.replace("api::", "").split(".")[0] || "strapi";

const exportController = ({ strapi }: { strapi: Core.Strapi }) => {
  const exportService = strapi.plugin(PLUGIN_ID).service("export-service");

  return {
    async export(ctx) {
      try {
        const { contentType, sortOrder, locale } = ctx.query;
        const base = ctBase(contentType as string);

        const buffer = await exportService.exportData(
          contentType as string,
          sortOrder as string | undefined,
          locale as string | undefined
        );
        ctx.set("Content-Type", EXCEL_CT);
        ctx.set("Content-Disposition", `attachment; filename="${base}-export-${today()}.xlsx"`);
        ctx.body = buffer;
      } catch (error: any) {
        strapi.log.error("Export error:", error);
        // Set directly, not thrown: Strapi replaces thrown 5xx messages with "Internal Server Error"
        ctx.status = 500;
        ctx.body = { error: `Export failed: ${error.message}` };
      }
    },
  };
};

export default exportController;
