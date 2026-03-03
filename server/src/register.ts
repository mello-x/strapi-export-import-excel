import type { Core } from "@strapi/strapi";

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: "plugins",
      displayName: "Access Settings",
      uid: "settings.read",
      pluginName: "strapi-export-import-excel",
    },
  ]);
};

export default register;
