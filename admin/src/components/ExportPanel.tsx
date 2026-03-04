import { Box, Button, Flex, SingleSelect, SingleSelectOption, Typography } from "@strapi/design-system";
import { Download } from "@strapi/icons";
import { useNavigate } from "react-router-dom";
import type { Locale } from "./LocaleSelect";
import { LocaleSelect } from "./LocaleSelect";

interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  exportEnabled?: boolean;
}

interface ExportPanelProps {
  collections: Collection[];
  locales: Locale[];
  exportCollection: string;
  exportLocale: string;
  defaultLocale: string;
  onCollectionChange: (uid: string) => void;
  onLocaleChange: (locale: string) => void;
}

const PANEL_STYLE = { border: "1px solid #E3E3E8", borderRadius: "8px", padding: "28px" };

const ExportPanel = ({
  collections,
  locales,
  exportCollection,
  exportLocale,
  defaultLocale,
  onCollectionChange,
  onLocaleChange,
}: ExportPanelProps) => {
  const navigate = useNavigate();

  const exportIsLocalized = collections.find((c) => c.uid === exportCollection)?.isLocalized ?? false;

  const handleExport = () => {
    if (!exportCollection) return;
    const params = new URLSearchParams();
    if (exportIsLocalized && exportLocale) {
      params.set("locale", exportLocale);
    }
    const search = params.toString() ? `?${params.toString()}` : "";
    navigate(`export/${encodeURIComponent(exportCollection)}${search}`);
  };

  return (
    <Box flex={1} style={PANEL_STYLE}>
      <Flex alignItems="center" gap={2} style={{ marginBottom: "8px" }}>
        <Download />
        <Typography variant="delta">Export</Typography>
      </Flex>
      <Typography textColor="neutral600" style={{ display: "block", marginBottom: "20px" }}>
        Select a collection, preview and reorder columns, then download as Excel.
      </Typography>

      <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
        Collection
      </Typography>
      <SingleSelect
        value={exportCollection}
        onChange={(val: string | number) => {
          onCollectionChange(String(val));
          onLocaleChange(defaultLocale);
        }}
        placeholder="Select collection..."
      >
        {collections
          .filter((c) => c.exportEnabled !== false)
          .map((col) => (
            <SingleSelectOption key={col.uid} value={col.uid}>
              {col.displayName}
            </SingleSelectOption>
          ))}
      </SingleSelect>

      {exportIsLocalized && locales.length > 0 && (
        <LocaleSelect locales={locales} value={exportLocale} onChange={onLocaleChange} />
      )}

      <Box style={{ marginTop: "20px" }}>
        <Button onClick={handleExport} disabled={!exportCollection} startIcon={<Download />} size="L" fullWidth>
          Preview &amp; Export
        </Button>
      </Box>
    </Box>
  );
};

export { ExportPanel };
