import { PLUGIN_ID } from "../../constants";

// Served on the admin API at `/${PLUGIN_ID}/*`, never on the public content API: every
// handler reads or writes documents with the privileged document service, so each
// route must be reachable by authenticated administrators only.
const isAuthenticatedAdmin = "admin::isAuthenticatedAdmin";

// Access to individual collections is checked in the controllers against the
// caller's Content Manager permissions (see utils/access.ts).
const authenticated = { policies: [isAuthenticatedAdmin] };

const settingsAdmin = {
  policies: [
    isAuthenticatedAdmin,
    { name: "admin::hasPermissions", config: { actions: [`plugin::${PLUGIN_ID}.settings.read`] } },
  ],
};

export default () => ({
  type: "admin",
  routes: [
    { method: "GET", path: "/settings", handler: "controller.getSettings", config: authenticated },
    { method: "PUT", path: "/settings", handler: "controller.updateSettings", config: settingsAdmin },
    { method: "GET", path: "/collections", handler: "controller.getCollections", config: authenticated },
    { method: "GET", path: "/locales", handler: "controller.getLocales", config: authenticated },
    {
      method: "GET",
      path: "/collections/:uid/fields",
      handler: "controller.getCollectionFields",
      config: authenticated,
    },
    { method: "GET", path: "/tabledata", handler: "controller.getTableData", config: authenticated },
    { method: "GET", path: "/export", handler: "export-controller.export", config: authenticated },
    { method: "POST", path: "/import-batch", handler: "import-controller.importBatch", config: authenticated },
    {
      method: "POST",
      path: "/import-component-batch",
      handler: "import-controller.importComponentBatch",
      config: authenticated,
    },
  ],
});
