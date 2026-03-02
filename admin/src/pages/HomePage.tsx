import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Flex,
  Main,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from "@strapi/design-system";
import { Download, Upload } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { LocaleSelect } from "../components/LocaleSelect";
import type { Locale } from "../components/LocaleSelect";

interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  exportEnabled: boolean;
  importEnabled: boolean;
}

const PANEL_STYLE = { border: "1px solid #E3E3E8", borderRadius: "8px", padding: "28px" };

const HomePage = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [locales, setLocales] = useState<Locale[]>([]);
  const [exportCollection, setExportCollection] = useState<string>("");
  const [exportLocale, setExportLocale] = useState<string>("");
  const [importCollection, setImportCollection] = useState<string>("");
  const [importLocale, setImportLocale] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [identifierField, setIdentifierField] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isLoadingHeaders, setIsLoadingHeaders] = useState(false);
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .catch(() =>
        toggleNotification({ type: "danger", message: "Failed to load collections or locales" })
      )
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportIsLocalized = collections.find((c) => c.uid === exportCollection)?.isLocalized ?? false;
  const importIsLocalized = collections.find((c) => c.uid === importCollection)?.isLocalized ?? false;
  const defaultLocale = locales.find((locale) => locale.isDefault)?.code ?? "";

  const handleExport = () => {
    if (!exportCollection) return;
    const params = new URLSearchParams();
    if (exportIsLocalized && exportLocale) {
      params.set("locale", exportLocale);
    }
    const search = params.toString() ? `?${params.toString()}` : "";
    navigate(`export/${encodeURIComponent(exportCollection)}${search}`);
  };

  const resetImportState = () => {
    setExcelHeaders([]);
    setIdentifierField("");
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileScan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !importCollection) return;

    setIsLoadingHeaders(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/strapi-export-import-excel/import-headers", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to read file headers");

      setExcelHeaders(result.headers ?? []);
      setPendingFile(file);
      setIdentifierField("");
    } catch (error: any) {
      toggleNotification({ type: "danger", message: `Failed to read file: ${error.message}` });
      resetImportState();
    } finally {
      setIsLoadingHeaders(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!pendingFile || !importCollection || !identifierField) return;

    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("contentType", importCollection);
    formData.append("identifierField", identifierField);
    if (importIsLocalized && importLocale) {
      formData.append("locale", importLocale);
    }

    try {
      const response = await fetch("/api/strapi-export-import-excel/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Import failed");

      const created = result.summary?.created ?? result.result?.created ?? 0;
      const updated = result.summary?.updated ?? result.result?.updated ?? 0;
      const errors = result.result?.errors?.length ?? 0;
      const total = created + updated;

      if (errors > 0) {
        toggleNotification({
          type: "warning",
          message: `Import completed with ${errors} error(s). Processed ${total} entries (${created} created, ${updated} updated)`,
        });
      } else if (total > 0) {
        toggleNotification({
          type: "success",
          message: `Import completed! ${created} created, ${updated} updated`,
        });
      } else {
        toggleNotification({ type: "info", message: "Import completed — no changes made" });
      }
    } catch (error: any) {
      toggleNotification({ type: "danger", message: `Import failed: ${error.message}` });
    } finally {
      setIsImporting(false);
      resetImportState();
    }
  };

  return (
    <Main>
      <Box padding={8}>
        <Typography variant="alpha" style={{ display: "block", marginBottom: "32px" }}>
          Export / Import Collections
        </Typography>

        {isLoading ? (
          <Typography>Loading collections...</Typography>
        ) : (
          <Flex gap={6} alignItems="stretch">
            {/* Export Panel */}
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
                {collections.filter((c) => c.exportEnabled !== false).map((col) => (
                  <SingleSelectOption key={col.uid} value={col.uid}>
                    {col.displayName}
                  </SingleSelectOption>
                ))}
              </SingleSelect>

              {exportIsLocalized && locales.length > 0 && (
                <LocaleSelect
                  locales={locales}
                  value={exportLocale}
                  onChange={setExportLocale}
                />
              )}

              <Box style={{ marginTop: "20px" }}>
                <Button
                  onClick={handleExport}
                  disabled={!exportCollection}
                  startIcon={<Download />}
                  size="L"
                  fullWidth
                >
                  Preview &amp; Export
                </Button>
              </Box>
            </Box>

            {/* Import Panel */}
            <Box flex={1} style={PANEL_STYLE}>
              <Flex alignItems="center" gap={2} style={{ marginBottom: "8px" }}>
                <Upload />
                <Typography variant="delta">Import</Typography>
              </Flex>
              <Typography textColor="neutral600" style={{ display: "block", marginBottom: "20px" }}>
                Select a collection and upload an Excel or JSON file to import data.
              </Typography>

              <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
                Collection
              </Typography>
              <SingleSelect
                value={importCollection}
                onChange={(val: string | number) => {
                  setImportCollection(String(val));
                  setImportLocale(defaultLocale);
                }}
                placeholder="Select collection..."
              >
                {collections.filter((c) => c.importEnabled !== false).map((col) => (
                  <SingleSelectOption key={col.uid} value={col.uid}>
                    {col.displayName}
                  </SingleSelectOption>
                ))}
              </SingleSelect>

              {importIsLocalized && locales.length > 0 && (
                <LocaleSelect
                  locales={locales}
                  value={importLocale}
                  onChange={setImportLocale}
                />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.json"
                onChange={handleFileScan}
                disabled={isLoadingHeaders || isImporting}
                style={{ display: "none" }}
              />

              {excelHeaders.length > 0 ? (
                <>
                  <Box style={{ marginTop: "16px" }}>
                    <Flex alignItems="center" justifyContent="space-between">
                      <Typography variant="omega" textColor="neutral600">
                        {pendingFile?.name}
                      </Typography>
                      <Button
                        variant="ghost"
                        size="S"
                        onClick={resetImportState}
                        disabled={isImporting}
                      >
                        ✕ Cancel
                      </Button>
                    </Flex>
                  </Box>

                  <Box style={{ marginTop: "16px" }}>
                    <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
                      Identifier Field
                    </Typography>
                    <SingleSelect
                      value={identifierField}
                      onChange={(val: string | number) => setIdentifierField(String(val))}
                      placeholder="Select identifier column..."
                    >
                      {excelHeaders.map((col) => (
                        <SingleSelectOption key={col} value={col}>
                          {col}
                        </SingleSelectOption>
                      ))}
                    </SingleSelect>
                  </Box>

                  <Box style={{ marginTop: "20px" }}>
                    <Button
                      onClick={handleImportConfirm}
                      loading={isImporting}
                      disabled={!identifierField || isImporting}
                      startIcon={<Upload />}
                      size="L"
                      fullWidth
                    >
                      Start Import
                    </Button>
                  </Box>
                </>
              ) : (
                <Box style={{ marginTop: "20px" }}>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    loading={isLoadingHeaders}
                    disabled={!importCollection || isLoadingHeaders}
                    startIcon={<Upload />}
                    variant="secondary"
                    size="L"
                    fullWidth
                  >
                    Upload File
                  </Button>
                </Box>
              )}
            </Box>
          </Flex>
        )}
      </Box>
    </Main>
  );
};

export { HomePage };
