import type { Core } from "@strapi/strapi";
import exportService from "./export-service";
import importService from "./import-service";
import nestedImportService from "./nested-import-service";

export default {
  "export-service": exportService,
  "import-service": importService,
  "nested-import-service": nestedImportService,
} satisfies Record<string, (params: { strapi: Core.Strapi }) => any>;
