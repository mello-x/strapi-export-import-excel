import type { Core } from "@strapi/strapi";
import service from "./service";
import exportService from "./export-service";
import importService from "./import-service";

export default {
  service,
  "export-service": exportService,
  "import-service": importService,
} satisfies Record<string, (params: { strapi: Core.Strapi }) => any>;
