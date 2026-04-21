import { Box, Button, Flex, SingleSelect, SingleSelectOption, Toggle, Typography } from "@strapi/design-system";
import { Upload } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { useRef, useState } from "react";
import { ImportResults } from "./ImportResults";
import type { Locale } from "./LocaleSelect";
import { LocaleSelect } from "./LocaleSelect";

interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  importEnabled?: boolean;
}

interface ImportPanelProps {
  collections: Collection[];
  locales: Locale[];
  importCollection: string;
  importLocale: string;
  defaultLocale: string;
  onCollectionChange: (uid: string) => void;
  onLocaleChange: (locale: string) => void;
}

const PANEL_STYLE = { border: "1px solid #E3E3E8", borderRadius: "8px", padding: "28px" };

const ImportPanel = ({
  collections,
  locales,
  importCollection,
  importLocale,
  defaultLocale,
  onCollectionChange,
  onLocaleChange,
}: ImportPanelProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [identifierField, setIdentifierField] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isLoadingHeaders, setIsLoadingHeaders] = useState(false);
  const [bulkLocaleUpload, setBulkLocaleUpload] = useState(false);
  const [publishOnImport, setPublishOnImport] = useState(false);
  const [importResults, setImportResults] = useState<{
    summary: { created: number; updated: number; skipped: number };
    errors: string[];
    warnings: string[];
  } | null>(null);
  const { toggleNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importIsLocalized = collections.find((c) => c.uid === importCollection)?.isLocalized ?? false;

  const resetImportState = () => {
    setExcelHeaders([]);
    setIdentifierField("");
    setPendingFile(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCollectionChange = (uid: string) => {
    onCollectionChange(uid);
    onLocaleChange(defaultLocale);
    setBulkLocaleUpload(false);
    resetImportState();
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
    if (publishOnImport) {
      formData.append("publishOnImport", "true");
    }
    if (bulkLocaleUpload) {
      formData.append("bulkLocaleUpload", "true");
    } else if (importIsLocalized && importLocale) {
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
      const skipped = result.summary?.skipped ?? result.result?.skipped ?? 0;
      const errorList: string[] = result.result?.errors ?? [];
      const warningList: string[] = result.result?.warnings ?? [];
      const total = created + updated;

      setImportResults({
        summary: { created, updated, skipped },
        errors: errorList,
        warnings: warningList,
      });

      if (errorList.length > 0) {
        toggleNotification({
          type: "warning",
          message: `Import completed with ${errorList.length} error(s). Processed ${total} entries (${created} created, ${updated} updated)`,
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
      setExcelHeaders([]);
      setIdentifierField("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Box flex={1} style={PANEL_STYLE}>
      <Flex alignItems="center" gap={2} style={{ marginBottom: "8px" }}>
        <Upload />
        <Typography variant="delta">Import</Typography>
      </Flex>
      <Typography textColor="neutral600" style={{ display: "block", marginBottom: "20px" }}>
        Select a collection and upload an Excel file to import data.
      </Typography>

      <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
        Collection
      </Typography>
      <SingleSelect
        value={importCollection}
        onChange={(val: string | number) => handleCollectionChange(String(val))}
        placeholder="Select collection..."
      >
        {collections
          .filter((c) => c.importEnabled !== false)
          .map((col) => (
            <SingleSelectOption key={col.uid} value={col.uid}>
              {col.displayName}
            </SingleSelectOption>
          ))}
      </SingleSelect>

      {importIsLocalized && locales.length > 0 && (
        <>
          <Box style={{ marginTop: "16px" }}>
            <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
              Bulk locale upload (each sheet = one locale)
            </Typography>
            <Toggle
              checked={bulkLocaleUpload}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setBulkLocaleUpload(e.target.checked);
                resetImportState();
              }}
              onLabel="On"
              offLabel="Off"
            />
          </Box>
          {!bulkLocaleUpload && <LocaleSelect locales={locales} value={importLocale} onChange={onLocaleChange} />}
          {bulkLocaleUpload && (
            <Box style={{ marginTop: "8px" }}>
              <Typography textColor="neutral500" variant="pi">
                Name each sheet after a locale code (e.g. <strong>en</strong>, <strong>th</strong>). All sheets will be
                imported into their matching locale.
              </Typography>
            </Box>
          )}
        </>
      )}

      <Box style={{ marginTop: "16px" }}>
        <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
          Publish on import
        </Typography>
        <Toggle
          checked={publishOnImport}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPublishOnImport(e.target.checked)}
          onLabel="Published"
          offLabel="Draft"
        />
        <Box style={{ marginTop: "4px" }}>
          <Typography textColor="neutral500" variant="pi">
            When off, imported entries will be saved as drafts. Required fields must be filled to publish.
          </Typography>
        </Box>
      </Box>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
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
              <Button variant="ghost" size="S" onClick={resetImportState} disabled={isImporting}>
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

      {importResults && (
        <ImportResults
          summary={importResults.summary}
          errors={importResults.errors}
          warnings={importResults.warnings}
          onDismiss={() => setImportResults(null)}
        />
      )}
    </Box>
  );
};

export { ImportPanel };
