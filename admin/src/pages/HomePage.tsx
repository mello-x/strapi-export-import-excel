import { Box, Flex, Main, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useState } from "react";
import { ExportPanel } from "../components/ExportPanel";
import { ImportPanel } from "../components/ImportPanel";
import type { Locale } from "../components/LocaleSelect";
import { NestedImportPanel } from "../components/NestedImportPanel";

interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  exportEnabled: boolean;
  importEnabled: boolean;
}

const HomePage = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [exportCollection, setExportCollection] = useState<string>("");
  const [exportLocale, setExportLocale] = useState<string>("");
  const [importCollection, setImportCollection] = useState<string>("");
  const [importLocale, setImportLocale] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const { toggleNotification } = useNotification();

  useEffect(() => {
    Promise.all([
      fetch("/api/strapi-export-import-excel/collections").then((r) => r.json()),
      fetch("/api/strapi-export-import-excel/locales").then((r) => r.json()),
    ])
      .then(([colData, locData]) => {
        const fetchedLocales: Locale[] = locData.locales ?? [];
        setCollections(colData.collections ?? []);
        setLocales(fetchedLocales);
        const defaultCode = fetchedLocales.find((locale) => locale.isDefault)?.code ?? "";
        setExportLocale(defaultCode);
        setImportLocale(defaultCode);
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
            <ExportPanel
              collections={collections}
              locales={locales}
              exportCollection={exportCollection}
              exportLocale={exportLocale}
              defaultLocale={defaultLocale}
              onCollectionChange={setExportCollection}
              onLocaleChange={setExportLocale}
            />
            <Flex gap={6} alignItems="stretch" style={{ marginTop: "24px" }}>
              <ImportPanel
                collections={collections}
                locales={locales}
                importCollection={importCollection}
                importLocale={importLocale}
                defaultLocale={defaultLocale}
                onCollectionChange={setImportCollection}
                onLocaleChange={setImportLocale}
              />
              <NestedImportPanel collections={collections} locales={locales} defaultLocale={defaultLocale} />
            </Flex>
          </>
        )}
      </Box>
    </Main>
  );
};

export { HomePage };
