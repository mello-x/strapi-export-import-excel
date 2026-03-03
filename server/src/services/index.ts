import type { Core } from "@strapi/strapi";
import exportService from "./export-service";
import importService from "./import-service";
import service from "./service";

export default {
  service,
  "export-service": exportService,
  "import-service": importService,
} satisfies Record<string, (params: { strapi: Core.Strapi }) => any>;
