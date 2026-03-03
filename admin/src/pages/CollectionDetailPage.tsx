import { Box, Button, Flex, Main, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FieldConfig } from "../components/DraggableFieldList";
import { DraggableFieldList } from "../components/DraggableFieldList";

const CollectionDetailPage = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { toggleNotification } = useNotification();

  const [displayName, setDisplayName] = useState<string>("");
  const [exportFields, setExportFields] = useState<FieldConfig[]>([]);
  const [importFields, setImportFields] = useState<FieldConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;

    const decodedUid = decodeURIComponent(uid);

    const fetchData = async () => {
      try {
        const [fieldsRes, settingsRes, collectionsRes] = await Promise.all([
          fetch(`/api/strapi-export-import-excel/collections/${encodeURIComponent(decodedUid)}/fields`),
          fetch("/api/strapi-export-import-excel/settings"),
          fetch("/api/strapi-export-import-excel/collections"),
        ]);

        const fieldsData = await fieldsRes.json();
        const settingsData = await settingsRes.json();
        const collectionsData = await collectionsRes.json();

        const schemaFields: { key: string; label: string }[] = fieldsData.fields ?? [];
        const colSettings = settingsData.collections?.[decodedUid] ?? {};
        const colInfo = (collectionsData.collections ?? []).find(
          (c: { uid: string; displayName: string }) => c.uid === decodedUid
        );
        setDisplayName(colInfo?.displayName ?? decodedUid);

        const buildFieldList = (stored: { key: string; enabled: boolean }[] | undefined): FieldConfig[] => {
          if (stored && stored.length > 0) {
            const storedKeys = new Set(stored.map((field) => field.key));
            const schemaMap = new Map(schemaFields.map((field) => [field.key, field.label]));
            const result: FieldConfig[] = stored
              .filter((field) => schemaMap.has(field.key))
              .map((field) => ({
                key: field.key,
                label: schemaMap.get(field.key) ?? field.key,
                enabled: field.enabled,
              }));
            for (const sf of schemaFields) {
              if (!storedKeys.has(sf.key)) {
                result.push({ key: sf.key, label: sf.label, enabled: true });
              }
            }
            return result;
          }
          return schemaFields.map((field) => ({ ...field, enabled: true }));
        };

        setExportFields(buildFieldList(colSettings.exportFields));
        setImportFields(buildFieldList(colSettings.importFields));
      } catch {
        toggleNotification({ type: "danger", message: "Failed to load collection fields" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, toggleNotification]);

  const handleSave = async () => {
    if (!uid) return;
    const decodedUid = decodeURIComponent(uid);
    setIsSaving(true);
    try {
      const settingsRes = await fetch("/api/strapi-export-import-excel/settings");
      const settingsData = await settingsRes.json();
      const currentCollections = settingsData.collections ?? {};

      const updatedCollections = {
        ...currentCollections,
        [decodedUid]: {
          ...currentCollections[decodedUid],
          exportFields: exportFields.map(({ key, enabled }) => ({ key, enabled })),
          importFields: importFields.map(({ key, enabled }) => ({ key, enabled })),
        },
      };

      const response = await fetch("/api/strapi-export-import-excel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: updatedCollections }),
      });

      if (!response.ok) throw new Error("Save failed");

      toggleNotification({ type: "success", message: "Field configuration saved" });
    } catch {
      toggleNotification({ type: "danger", message: "Failed to save field configuration" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Main>
      <Box padding={8}>
        <Flex justifyContent="space-between" alignItems="center" paddingBottom={6}>
          <Flex alignItems="center" gap={3}>
            <Button variant="ghost" onClick={() => navigate("/plugins/strapi-export-import-excel")}>
              ← Back
            </Button>
            <Typography variant="alpha">{displayName || decodeURIComponent(uid ?? "")}</Typography>
          </Flex>
          <Button onClick={handleSave} loading={isSaving} disabled={isLoading}>
            Save
          </Button>
        </Flex>

        {isLoading ? (
          <Box padding={4}>
            <Typography>Loading fields...</Typography>
          </Box>
        ) : (
          <Flex
            gap={8}
            alignItems="flex-start"
            style={{ border: "1px solid #E3E3E8", borderRadius: "8px", padding: "24px" }}
          >
            <DraggableFieldList title="Export Fields" fields={exportFields} onChange={setExportFields} />
            <Box style={{ width: "1px", background: "#E3E3E8", alignSelf: "stretch", flexShrink: 0 }} />
            <DraggableFieldList title="Import Fields" fields={importFields} onChange={setImportFields} />
          </Flex>
        )}
      </Box>
    </Main>
  );
};

export { CollectionDetailPage };
