import { Box, Button, Flex, Main, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ColumnSorter } from "../components/ColumnSorter";
import { StrapiTable } from "../components/StrapiTable";
import { PLUGIN_ID } from "../pluginId";
import { nextBatchSize, responseError } from "../shared";

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
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);

  const contentType = uid ? decodeURIComponent(uid) : null;
  const baseName = contentType?.replace("api::", "").split(".")[0] ?? "";
  const locale = new URLSearchParams(location.search).get("locale");

  // Stable ref so notification can be called without being a dep
  const notifyRef = useRef(toggleNotification);
  notifyRef.current = toggleNotification;

  // Returns the response data (or undefined on error) so the initial load can read `columns`
  const loadPage = async (cols: string[], page: number, limit: number, ct: string, loc: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ contentType: ct, page: String(page), limit: String(limit) });
      if (cols.length > 0) params.set("columns", cols.join(","));
      if (loc) params.set("locale", loc);

      const res = await fetch(`/api/${PLUGIN_ID}/tabledata?${params}`);
      if (!res.ok) throw new Error(await responseError(res));

      const data = await res.json();
      setTableData(data.data ?? []);
      setTotalRows(data.total ?? 0);
      return data;
    } catch (error: any) {
      notifyRef.current({ type: "danger", message: `Failed to load data: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadPage only touches setters and notifyRef
  useEffect(() => {
    if (!contentType) return;

    const init = async () => {
      let initialCols: string[] = [];
      try {
        const res = await fetch(`/api/${PLUGIN_ID}/settings`);
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

      const data = await loadPage(initialCols, 1, 10, contentType, locale);
      if (initialCols.length === 0 && data?.columns?.length > 0) {
        setAllColumns(data.columns);
        setColumns(data.columns);
      }
    };

    init();
  }, [contentType, locale]); // locale is stable (from URL), safe to include

  // Removing or restoring a column refetches: which repeatable columns are present decides
  // how many rows each entry spans, so hiding them client-side would leave duplicate rows.
  // Reordering keeps the same rows, so it doesn't refetch.
  const changeColumns = (next: string[]) => {
    setColumns(next);
    if (contentType) loadPage(next, currentPage, perPage, contentType, locale);
  };

  const handleDownload = async () => {
    if (!contentType) return;
    setIsDownloading(true);
    try {
      // Page through /tabledata and build the file in the browser: one big /export request
      // would load every entry at once and can exceed a short proxy timeout.
      let cols = columns;
      const rows: Record<string, any>[] = [];
      let start = 0;
      let limit = 10;
      let total = Infinity;
      while (start < total) {
        const params = new URLSearchParams({ contentType, start: String(start), limit: String(limit) });
        if (cols.length > 0) params.set("columns", cols.join(","));
        if (locale) params.set("locale", locale);

        const began = performance.now();
        const res = await fetch(`/api/${PLUGIN_ID}/tabledata?${params}`);
        if (!res.ok) throw new Error(`Entries ${start + 1}–${start + limit}: ${await responseError(res)}`);
        const data = await res.json();

        // Pin the columns from the first page so every page has the same shape
        if (cols.length === 0) cols = data.columns ?? [];
        rows.push(...(data.data ?? []));
        total = data.total ?? 0;
        start += limit;
        limit = nextBatchSize(limit, performance.now() - began, 100);
        setDownloadProgress({ done: Math.min(start, total), total });
      }

      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const sheetName = (contentType.split(".").pop() ?? "export").replace(/[^\w\s-]/gi, "_").substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: cols }), sheetName);
      XLSX.writeFile(workbook, `${baseName}-export-${new Date().toISOString().split("T")[0]}.xlsx`);

      notifyRef.current({ type: "success", message: "Export completed successfully" });
    } catch (error: any) {
      notifyRef.current({ type: "danger", message: `Export failed: ${error.message}` });
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
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
            {downloadProgress ? `Exporting… ${downloadProgress.done}/${downloadProgress.total}` : "Download Excel"}
          </Button>
        </Flex>

        {/* Column Sorter */}
        <Box style={{ border: "1px solid #E3E3E8", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
          <ColumnSorter
            columns={columns}
            onColumnsReorder={(newCols) => setColumns(newCols)}
            onColumnDelete={(col) => changeColumns(columns.filter((c) => c !== col))}
            onResetColumns={() => changeColumns([...allColumns])}
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
