import type { Core } from "@strapi/strapi";

const EXCEL_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const today = () => new Date().toISOString().split("T")[0];
const ctBase = (ct: string | undefined) => (ct as string)?.replace("api::", "").split(".")[0] || "strapi";

const exportController = ({ strapi }: { strapi: Core.Strapi }) => {
  const exportService = strapi.plugin("strapi-export-import-excel").service("export-service");

  const setExcelHeaders = (ctx: any, filename: string) => {
    ctx.set("Content-Type", EXCEL_CT);
    ctx.set("Content-Disposition", `attachment; filename="${filename}"`);
  };

  return {
    async export(ctx) {
      try {
        const { format = "excel", contentType, sortOrder, locale, ...filters } = ctx.query;
        const columnsParam = sortOrder as string | undefined;
        const base = ctBase(contentType as string);

        if (format === "excel") {
          const buffer = await exportService.exportData(
            "excel",
            contentType as string,
            filters,
            columnsParam,
            locale as string | undefined
          );
          setExcelHeaders(ctx, `${base}-export-${today()}.xlsx`);
          ctx.body = buffer;
        } else {
          const data = await exportService.exportData(
            "json",
            contentType as string,
            filters,
            undefined,
            locale as string | undefined
          );
          ctx.set("Content-Type", "application/json");
          ctx.set("Content-Disposition", `attachment; filename="${base}-export-${today()}.json"`);
          ctx.body = JSON.stringify(data, null, 2);
        }
      } catch (error) {
        strapi.log.error("Export error:", error);
        ctx.throw(500, "Export failed");
      }
    },

    async exportSingle(ctx) {
      try {
        const { contentType, id } = ctx.params;
        const buffer = await exportService.exportSingleEntry(contentType, id);
        setExcelHeaders(ctx, `entry-${id}-${today()}.xlsx`);
        ctx.body = buffer;
      } catch (error) {
        strapi.log.error("Export single error:", error);
        ctx.throw(500, "Export failed");
      }
    },
  };
};

export default exportController;
