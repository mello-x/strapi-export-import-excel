import { Initializer } from "./components/Initializer";
import { PluginIcon } from "./components/PluginIcon";
import { PLUGIN_ID } from "./pluginId";

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: "Export / Import",
      },
      Component: async () => {
        const { App } = await import("./pages/App");

        return App;
      },
    });

    app.createSettingSection(
      {
        id: PLUGIN_ID,
        intlLabel: { id: `${PLUGIN_ID}.settings.section`, defaultMessage: "Export / Import Excel" },
      },
      [
        {
          intlLabel: { id: `${PLUGIN_ID}.settings.collections`, defaultMessage: "Collections" },
          id: `${PLUGIN_ID}.collections`,
          to: `/settings/${PLUGIN_ID}`,
          Component: async () => {
            const { SettingsPage } = await import("./pages/SettingsPage");
            return SettingsPage;
          },
          permissions: [{ action: `plugin::${PLUGIN_ID}.settings.read`, subject: null }],
        },
      ]
    );

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(_app: any) {},
};
