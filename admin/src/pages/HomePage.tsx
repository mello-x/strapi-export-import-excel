import { Box, Flex, Main, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useState } from "react";
import { ExportPanel } from "../components/ExportPanel";
import { ImportPanel } from "../components/ImportPanel";
import type { Locale } from "../components/LocaleSelect";
import { NestedImportPanel } from "../components/NestedImportPanel";
import { PLUGIN_ID } from "../pluginId";
import type { Collection } from "../shared";

const HomePage = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toggleNotification } = useNotification();

  useEffect(() => {
    Promise.all([
      fetch(`/api/${PLUGIN_ID}/collections`).then((r) => r.json()),
      fetch(`/api/${PLUGIN_ID}/locales`).then((r) => r.json()),
    ])
      .then(([colData, locData]) => {
        setCollections(colData.collections ?? []);
        setLocales(locData.locales ?? []);
      })
      .catch(() => toggleNotification({ type: "danger", message: "Failed to load collections or locales" }))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleNotification]);

  const defaultLocale = locales.find((locale) => locale.isDefault)?.code ?? "";

  return (
    <Main>
      <Box padding={8}>
        <Typography variant="alpha" style={{ display: "block", marginBottom: "32px" }}>
          Export / Import Collections
        </Typography>

        {isLoading ? (
          <Typography>Loading collections...</Typography>
        ) : (
          <>
            <ExportPanel collections={collections} locales={locales} defaultLocale={defaultLocale} />
            <Flex gap={6} alignItems="stretch" style={{ marginTop: "24px" }}>
              <ImportPanel collections={collections} locales={locales} defaultLocale={defaultLocale} />
              <NestedImportPanel collections={collections} locales={locales} defaultLocale={defaultLocale} />
            </Flex>
          </>
        )}
      </Box>
    </Main>
  );
};

export { HomePage };
