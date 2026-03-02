import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Main,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Toggle,
  Typography,
} from "@strapi/design-system";
import { useNotification, useRBAC } from "@strapi/strapi/admin";
import { PLUGIN_ID } from "../pluginId";

interface Collection {
  uid: string;
  displayName: string;
  exportEnabled: boolean;
  importEnabled: boolean;
}

const PERMISSIONS = [{ action: `plugin::${PLUGIN_ID}.settings.read`, subject: null }];

const SettingsPage = () => {
  const { allowedActions, isLoading: isRBACLoading } = useRBAC({ canRead: PERMISSIONS });
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toggleNotification } = useNotification();

  useEffect(() => {
    fetch("/api/strapi-export-import-excel/collections")
      .then((r) => r.json())
      .then((data) => {
        setCollections(
          (data.collections ?? []).map((c: any) => ({
            uid: c.uid,
            displayName: c.displayName,
            exportEnabled: c.exportEnabled ?? true,
            importEnabled: c.importEnabled ?? true,
          }))
        );
      })
      .catch(() =>
        toggleNotification({ type: "danger", message: "Failed to load collections" })
      )
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (uid: string, field: "exportEnabled" | "importEnabled") => {
    setCollections((prev) =>
      prev.map((c) => (c.uid === uid ? { ...c, [field]: !c[field] } : c))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body = Object.fromEntries(
        collections.map(({ uid, exportEnabled, importEnabled }) => [uid, { exportEnabled, importEnabled }])
      );
      const response = await fetch("/api/strapi-export-import-excel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: body }),
      });
      if (!response.ok) throw new Error("Save failed");
      toggleNotification({ type: "success", message: "Settings saved" });
    } catch {
      toggleNotification({ type: "danger", message: "Failed to save settings" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isRBACLoading) {
    return (
      <Main>
        <Box padding={8}>
          <Typography>Loading...</Typography>
        </Box>
      </Main>
    );
  }

  if (!allowedActions.canRead) {
    return (
      <Main>
        <Box padding={8}>
          <Typography variant="alpha" style={{ display: "block", marginBottom: "16px" }}>
            Collections Configuration
          </Typography>
          <Typography textColor="neutral600">
            You don&apos;t have access to this page.
          </Typography>
        </Box>
      </Main>
    );
  }

  return (
    <Main>
      <Box padding={8}>
        <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: "24px" }}>
          <Typography variant="alpha">Collections Configuration</Typography>
          <Button onClick={handleSave} loading={isSaving} disabled={isLoading || isSaving}>
            Save
          </Button>
        </Flex>

        {isLoading ? (
          <Typography>Loading collections...</Typography>
        ) : (
          <Table colCount={3} rowCount={collections.length}>
            <Thead>
              <Tr>
                <Th>
                  <Typography variant="sigma">Collection</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Enable for Export</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Enable for Import</Typography>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {collections.map((col) => (
                <Tr key={col.uid}>
                  <Td>
                    <Typography>{col.displayName}</Typography>
                  </Td>
                  <Td>
                    <Toggle
                      checked={col.exportEnabled}
                      onChange={() => toggle(col.uid, "exportEnabled")}
                      onLabel="On"
                      offLabel="Off"
                    />
                  </Td>
                  <Td>
                    <Toggle
                      checked={col.importEnabled}
                      onChange={() => toggle(col.uid, "importEnabled")}
                      onLabel="On"
                      offLabel="Off"
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Box>
    </Main>
  );
};

export { SettingsPage };
