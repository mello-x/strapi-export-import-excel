import { Box, Button, Flex, SingleSelect, SingleSelectOption, Typography } from "@strapi/design-system";
import { Download } from "@strapi/icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Collection, PANEL_STYLE } from "../shared";
import type { Locale } from "./LocaleSelect";
import { LocaleSelect } from "./LocaleSelect";

interface ExportPanelProps {
  collections: Collection[];
  locales: Locale[];
  defaultLocale: string;
}

const ExportPanel = ({ collections, locales, defaultLocale }: ExportPanelProps) => {
  const [exportCollection, setExportCollection] = useState("");
  const [exportLocale, setExportLocale] = useState(defaultLocale);
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
          setExportCollection(String(val));
          setExportLocale(defaultLocale);
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
        <LocaleSelect locales={locales} value={exportLocale} onChange={setExportLocale} />
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
