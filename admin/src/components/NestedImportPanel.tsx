import { Box, Button, Flex, SingleSelect, SingleSelectOption, Toggle, Typography } from "@strapi/design-system";
import { Upload } from "@strapi/icons";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useRef, useState } from "react";
import { ImportResults } from "./ImportResults";
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
  const [bulkLocaleUpload, setBulkLocaleUpload] = useState(false);
  const [importResults, setImportResults] = useState<{
    summary: { created: number; updated: number; skipped: number };
    errors: string[];
    warnings: string[];
  } | null>(null);
  const { toggleNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }, [collection, defaultLocale]);

  const handleImport = async () => {
    if (!pendingFile || !collection || !componentField || !identifierField) return;

    setIsImporting(true);
    setImportResults(null);
    const formData = new FormData();
    formData.append("file", pendingFile);
    formData.append("contentType", collection);
    formData.append("componentField", componentField);
    formData.append("identifierField", identifierField);
    if (bulkLocaleUpload) {
      formData.append("bulkLocaleUpload", "true");
    } else if (isLocalized && locale) {
      formData.append("locale", locale);
    }

    try {
      const response = await fetch("/api/strapi-export-import-excel/import-component", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Component import failed");

      const created = result.summary?.created ?? result.result?.created ?? 0;
      const updated = result.summary?.updated ?? 0;
      const skipped = result.summary?.skipped ?? 0;
      const errorList: string[] = result.result?.errors ?? [];
      const warningList: string[] = result.result?.warnings ?? [];

      setImportResults({
        summary: { created, updated, skipped },
        errors: errorList,
        warnings: warningList,
      });

      if (errorList.length > 0) {
        toggleNotification({
          type: "warning",
          message: `Component import completed with ${errorList.length} error(s). ${updated} updated, ${skipped} skipped.`,
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
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
                setPendingFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
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
        onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
        disabled={isImporting}
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
                <Button
                  variant="ghost"
                  size="S"
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isImporting}
                >
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
            </>
          ) : (
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
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

export { NestedImportPanel };
