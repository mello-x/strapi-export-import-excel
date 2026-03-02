import type { Core } from "@strapi/strapi";
import controller from "./controller";
import exportController from "./export-controller";
import importController from "./import-controller";

export default {
  controller,
  "export-controller": exportController,
  "import-controller": importController,
} satisfies Record<string, (params: { strapi: Core.Strapi }) => any>;
