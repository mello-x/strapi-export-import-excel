import type { Core } from "@strapi/strapi";
import { PLUGIN_ID } from "./constants";

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.admin.services.permission.actionProvider.registerMany([
    {
      section: "plugins",
      displayName: "Access Settings",
      uid: "settings.read",
      pluginName: PLUGIN_ID,
    },
  ]);
};

export default register;
