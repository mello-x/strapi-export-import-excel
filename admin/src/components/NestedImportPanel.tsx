import { Box, Button, Flex, SingleSelect, SingleSelectOption, Toggle, Typography } from "@strapi/design-system";
import { Upload } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useRef, useState } from "react";
import { runComponentImport } from "../utils/importClient";
import { type ParsedSheet, parseWorkbook } from "../utils/parseWorkbook";
import type { Locale } from "./LocaleSelect";
import { LocaleSelect } from "./LocaleSelect";

interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  importEnabled?: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  type: string;
}

interface NestedImportPanelProps {
  collections: Collection[];
  locales: Locale[];
  defaultLocale: string;
}

const PANEL_STYLE = { border: "1px solid #E3E3E8", borderRadius: "8px", padding: "28px" };

const NestedImportPanel = ({ collections, locales, defaultLocale }: NestedImportPanelProps) => {
  const [collection, setCollection] = useState("");
  const [locale, setLocale] = useState(defaultLocale);
  const [componentField, setComponentField] = useState("");
  const [identifierField, setIdentifierField] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkLocaleUpload, setBulkLocaleUpload] = useState(false);
  const { toggleNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFile = () => {
    setPendingFile(null);
    setParsedSheets([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      clearFile();
      return;
    }
    setIsParsing(true);
    try {
      const { sheets } = await parseWorkbook(file);
      setParsedSheets(sheets);
      setPendingFile(file);
    } catch (error: any) {
      toggleNotification({ type: "danger", message: `Failed to read file: ${error.message}` });
      clearFile();
    } finally {
      setIsParsing(false);
    }
  };

  const isLocalized = collections.find((c) => c.uid === collection)?.isLocalized ?? false;

  const repeatableComponentFields = fields.filter((f) => f.type === "component");
  const identifierFields = fields.filter((f) => f.type !== "component" && f.type !== "relation");

  useEffect(() => {
    if (!collection) {
      setFields([]);
      setComponentField("");
      setIdentifierField("");
      return;
    }

    fetch(`/api/strapi-export-import-excel/collections/${encodeURIComponent(collection)}/fields`)
      .then((res) => res.json())
      .then((data) => setFields(data.fields ?? []))
      .catch(() => setFields([]));

    setComponentField("");
    setIdentifierField("");
    setLocale(defaultLocale);
    setBulkLocaleUpload(false);
    setPendingFile(null);
    setParsedSheets([]);
  }, [collection, defaultLocale]);

  const handleImport = async () => {
    if (!pendingFile || !collection || !componentField || !identifierField || parsedSheets.length === 0) return;

    setIsImporting(true);
    setProgress({ done: 0, total: 0 });

    try {
      // Grouped by parent identifier and sent to the server in small batches, so a
      // large nested import can't be cut off by a reverse-proxy / LB timeout.
      const summary = await runComponentImport(
        {
          contentType: collection,
          componentField,
          identifierField,
          bulkLocaleUpload,
          locale: isLocalized ? locale : null,
        },
        parsedSheets,
        (done, total) => setProgress({ done, total })
      );

      const { updated, skipped } = summary;
      const errors = summary.errors.length;

      if (errors > 0) {
        toggleNotification({
          type: "warning",
          message: `Component import completed with ${errors} error(s). ${updated} updated, ${skipped} skipped.`,
        });
      } else if (updated > 0) {
        toggleNotification({
          type: "success",
          message: `Component import completed! ${updated} parent entries updated.`,
        });
      } else {
        toggleNotification({ type: "info", message: "Component import completed — no changes made" });
      }
    } catch (error: any) {
      toggleNotification({ type: "danger", message: `Component import failed: ${error.message}` });
    } finally {
      setIsImporting(false);
      setProgress(null);
      clearFile();
    }
  };

  return (
    <Box flex={1} style={PANEL_STYLE}>
      <Flex alignItems="center" gap={2} style={{ marginBottom: "8px" }}>
        <Upload />
        <Typography variant="delta">Nested Import</Typography>
      </Flex>
      <Typography textColor="neutral600" style={{ display: "block", marginBottom: "20px" }}>
        Import repeatable component data from a separate Excel file, linked to parent entries by an identifier field.
      </Typography>

      <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
        Collection
      </Typography>
      <SingleSelect
        value={collection}
        onChange={(val: string | number) => setCollection(String(val))}
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

      {collection && repeatableComponentFields.length > 0 && (
        <Box style={{ marginTop: "16px" }}>
          <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
            Component Field
          </Typography>
          <SingleSelect
            value={componentField}
            onChange={(val: string | number) => setComponentField(String(val))}
            placeholder="Select component field..."
          >
            {repeatableComponentFields.map((f) => (
              <SingleSelectOption key={f.key} value={f.key}>
                {f.label}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      )}

      {collection && componentField && (
        <Box style={{ marginTop: "16px" }}>
          <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
            Parent Identifier Field
          </Typography>
          <SingleSelect
            value={identifierField}
            onChange={(val: string | number) => setIdentifierField(String(val))}
            placeholder="Select identifier field..."
          >
            {identifierFields.map((f) => (
              <SingleSelectOption key={f.key} value={f.key}>
                {f.label}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Box>
      )}

      {isLocalized && collection && locales.length > 0 && (
        <>
          <Box style={{ marginTop: "16px" }}>
            <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
              Bulk locale upload (each sheet = one locale)
            </Typography>
            <Toggle
              checked={bulkLocaleUpload}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setBulkLocaleUpload(e.target.checked);
                clearFile();
              }}
              onLabel="On"
              offLabel="Off"
            />
          </Box>
          {!bulkLocaleUpload && <LocaleSelect locales={locales} value={locale} onChange={setLocale} />}
          {bulkLocaleUpload && (
            <Box style={{ marginTop: "8px" }}>
              <Typography textColor="neutral500" variant="pi">
                Name each sheet after a locale code (e.g. <strong>en</strong>, <strong>th</strong>). All sheets will
                import component data into their matching locale.
              </Typography>
            </Box>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        disabled={isImporting || isParsing}
        style={{ display: "none" }}
      />

      {collection && componentField && identifierField && (
        <Box style={{ marginTop: "20px" }}>
          {pendingFile ? (
            <>
              <Flex alignItems="center" justifyContent="space-between" style={{ marginBottom: "12px" }}>
                <Typography variant="omega" textColor="neutral600">
                  {pendingFile.name}
                </Typography>
                <Button variant="ghost" size="S" onClick={clearFile} disabled={isImporting}>
                  Cancel
                </Button>
              </Flex>
              <Button
                onClick={handleImport}
                loading={isImporting}
                disabled={isImporting}
                startIcon={<Upload />}
                size="L"
                fullWidth
              >
                Start Nested Import
              </Button>
              {isImporting && progress && progress.total > 0 && (
                <Box style={{ marginTop: "8px", textAlign: "center" }}>
                  <Typography variant="pi" textColor="neutral600">
                    Importing… {progress.done}/{progress.total} parents
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Button
              onClick={() => fileInputRef.current?.click()}
              loading={isParsing}
              disabled={isImporting || isParsing}
              startIcon={<Upload />}
              variant="secondary"
              size="L"
              fullWidth
            >
              Upload Component File
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export { NestedImportPanel };
