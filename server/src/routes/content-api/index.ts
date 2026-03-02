export default () => ({
  type: "content-api",
  routes: [
    {
      method: "GET",
      path: "/",
      handler: "controller.index",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/settings",
      handler: "controller.getSettings",
      config: { auth: false, policies: [] },
    },
    {
      method: "PUT",
      path: "/settings",
      handler: "controller.updateSettings",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/collections",
      handler: "controller.getCollections",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/locales",
      handler: "controller.getLocales",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/collections/:uid/fields",
      handler: "controller.getCollectionFields",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/tabledata",
      handler: "controller.getTableData",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/export",
      handler: "export-controller.export",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/export/:contentType/:id",
      handler: "export-controller.exportSingle",
      config: { auth: false, policies: [] },
    },
    {
      method: "POST",
      path: "/import-headers",
      handler: "import-controller.getImportHeaders",
      config: { auth: false, policies: [] },
    },
    {
      method: "POST",
      path: "/import",
      handler: "import-controller.import",
      config: { auth: false, policies: [] },
    },
  ],
});
