export default () => ({
  type: "content-api",
  routes: [
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
      method: "POST",
      path: "/import-batch",
      handler: "import-controller.importBatch",
      config: { auth: false, policies: [] },
    },
    {
      method: "POST",
      path: "/import-component-batch",
      handler: "import-controller.importComponentBatch",
      config: { auth: false, policies: [] },
    },
  ],
});
