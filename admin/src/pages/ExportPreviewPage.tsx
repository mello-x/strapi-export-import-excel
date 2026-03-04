import { Box, Button, Flex, Main, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ColumnSorter } from "../components/ColumnSorter";
import { StrapiTable } from "../components/StrapiTable";

const ExportPreviewPage = () => {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleNotification } = useNotification();

  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [tableData, setTableData] = useState<Record<string, any>[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const contentType = uid ? decodeURIComponent(uid) : null;
  const baseName = contentType?.replace("api::", "").split(".")[0] ?? "";
  const locale = new URLSearchParams(location.search).get("locale");

  // Stable ref so notification can be called without being a dep
  const notifyRef = useRef(toggleNotification);
  notifyRef.current = toggleNotification;

  // Used for pagination — called from event handlers, not effects
  const loadPage = async (cols: string[], page: number, limit: number, ct: string, loc: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ contentType: ct, page: String(page), limit: String(limit) });
      if (cols.length > 0) params.set("columns", cols.join(","));
      if (loc) params.set("locale", loc);

      const res = await fetch(`/api/strapi-export-import-excel/tabledata?${params}`);
      if (!res.ok) throw new Error("Failed to fetch table data");

      const data = await res.json();
      setTableData(data.data ?? []);
      setTotalRows(data.total ?? 0);
    } catch (error: any) {
      notifyRef.current({ type: "danger", message: `Failed to load data: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Initial load — fetchData is defined inside so linter has no complaints
  useEffect(() => {
    if (!contentType) return;

    const init = async () => {
      let initialCols: string[] = [];
      try {
        const res = await fetch("/api/strapi-export-import-excel/settings");
        const data = await res.json();
        const colSettings = data.collections?.[contentType];
        if (colSettings?.exportFields) {
          initialCols = colSettings.exportFields
            .filter((f: { key: string; enabled: boolean }) => f.enabled)
            .map((f: { key: string; enabled: boolean }) => f.key);
        }
      } catch {
        // proceed without settings
      }

      setAllColumns(initialCols);
      setColumns(initialCols);

      // Fetch initial table data
      setLoading(true);
      try {
        const params = new URLSearchParams({ contentType, page: "1", limit: "10" });
        if (initialCols.length > 0) params.set("columns", initialCols.join(","));
        if (locale) params.set("locale", locale);

        const res = await fetch(`/api/strapi-export-import-excel/tabledata?${params}`);
        if (!res.ok) throw new Error("Failed to fetch table data");

        const data = await res.json();
        setTableData(data.data ?? []);
        setTotalRows(data.total ?? 0);

        if (initialCols.length === 0 && data.columns?.length > 0) {
          setAllColumns(data.columns);
          setColumns(data.columns);
        }
      } catch (error: any) {
        notifyRef.current({ type: "danger", message: `Failed to load data: ${error.message}` });
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [contentType, locale]); // locale is stable (from URL), safe to include

  const handleDownload = async () => {
    if (!contentType) return;
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({ format: "excel", contentType });
      if (columns.length > 0) params.set("sortOrder", columns.join(","));
      if (locale) params.set("locale", locale);

      const filterSearch = new URLSearchParams(location.search);
      for (const [key, value] of filterSearch.entries()) {
        if (!["format", "contentType", "columns", "locale"].includes(key)) {
          params.set(key, value);
        }
      }

      const response = await fetch(`/api/strapi-export-import-excel/export?${params}`);
      if (!response.ok) throw new Error("Export request failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}-export-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      notifyRef.current({ type: "success", message: "Export completed successfully" });
    } catch (error: any) {
      notifyRef.current({ type: "danger", message: `Export failed: ${error.message}` });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Main>
      <Box padding={8}>
        {/* Header */}
        <Flex justifyContent="space-between" alignItems="center" paddingBottom={6}>
          <Flex alignItems="center" gap={3}>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              ← Back
            </Button>
            <Typography variant="alpha">Export Preview: {baseName}</Typography>
            {locale && (
              <Typography
                textColor="neutral600"
                style={{
                  background: "#F0F0FF",
                  border: "1px solid #C0C0FF",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "12px",
                }}
              >
                {locale}
              </Typography>
            )}
          </Flex>
          <Button onClick={handleDownload} loading={isDownloading} disabled={loading || columns.length === 0}>
            Download Excel
          </Button>
        </Flex>

        {/* Column Sorter */}
        <Box style={{ border: "1px solid #E3E3E8", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
          <ColumnSorter
            columns={columns}
            onColumnsReorder={(newCols) => setColumns(newCols)}
            onColumnDelete={(col) => setColumns((prev) => prev.filter((c) => c !== col))}
            onResetColumns={() => setColumns([...allColumns])}
            originalColumnsCount={allColumns.length}
          />
        </Box>

        {/* Data Table */}
        <Box style={{ border: "1px solid #E3E3E8", borderRadius: "8px", overflow: "hidden" }}>
          <StrapiTable
            columns={columns}
            data={tableData}
            totalRows={totalRows}
            currentPage={currentPage}
            perPage={perPage}
            loading={loading}
            onPageChange={(page) => {
              setCurrentPage(page);
              if (contentType) loadPage(columns, page, perPage, contentType, locale);
            }}
            onPerPageChange={(newPerPage) => {
              setPerPage(newPerPage);
              setCurrentPage(1);
              if (contentType) loadPage(columns, 1, newPerPage, contentType, locale);
            }}
          />
        </Box>
      </Box>
    </Main>
  );
};

export { ExportPreviewPage };
