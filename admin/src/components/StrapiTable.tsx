import {
  Box,
  Button,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from "@strapi/design-system";

interface StrapiTableProps {
  columns: string[];
  data: Record<string, any>[];
  totalRows: number;
  currentPage: number;
  perPage: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
}

const StrapiTable = ({
  columns,
  data,
  totalRows,
  currentPage,
  perPage,
  loading,
  onPageChange,
  onPerPageChange,
}: StrapiTableProps) => {
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));

  const renderCellValue = (value: any): string => (value == null ? "" : String(value));

  return (
    <Box>
      <Box style={{ overflowX: "auto" }}>
        <Table colCount={columns.length} rowCount={data.length}>
          <Thead>
            <Tr>
              {columns.map((col) => (
                <Th key={col}>
                  <Typography variant="sigma">{col}</Typography>
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {loading ? (
              <Tr>
                <Td colSpan={columns.length}>
                  <Box padding={4} style={{ textAlign: "center" }}>
                    <Typography textColor="neutral600">Loading...</Typography>
                  </Box>
                </Td>
              </Tr>
            ) : columns.length === 0 ? (
              <Tr>
                <Td>
                  <Box padding={4} style={{ textAlign: "center" }}>
                    <Typography textColor="neutral600">No columns selected</Typography>
                  </Box>
                </Td>
              </Tr>
            ) : data.length === 0 ? (
              <Tr>
                <Td colSpan={columns.length}>
                  <Box padding={4} style={{ textAlign: "center" }}>
                    <Typography textColor="neutral600">No data found</Typography>
                  </Box>
                </Td>
              </Tr>
            ) : (
              data.map((row, rowIdx) => (
                <Tr key={row.documentId ?? row.id ?? rowIdx}>
                  {columns.map((col) => (
                    <Td key={col}>
                      <Typography
                        style={{
                          maxWidth: "200px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                        }}
                        title={renderCellValue(row[col])}
                      >
                        {renderCellValue(row[col])}
                      </Typography>
                    </Td>
                  ))}
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>

      <Flex justifyContent="space-between" alignItems="center" padding={4}>
        <Flex alignItems="center" gap={2}>
          <Typography variant="omega" textColor="neutral600">
            Rows per page:
          </Typography>
          <SingleSelect
            value={String(perPage)}
            onChange={(val: string | number) => onPerPageChange(Number(val))}
            size="S"
          >
            <SingleSelectOption value="10">10</SingleSelectOption>
            <SingleSelectOption value="25">25</SingleSelectOption>
            <SingleSelectOption value="50">50</SingleSelectOption>
            <SingleSelectOption value="100">100</SingleSelectOption>
          </SingleSelect>
        </Flex>

        <Flex alignItems="center" gap={3}>
          <Typography variant="omega" textColor="neutral600">
            Page {currentPage} of {totalPages} ({totalRows} total)
          </Typography>
          <Button
            variant="ghost"
            size="S"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
          >
            ← Previous
          </Button>
          <Button
            variant="ghost"
            size="S"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
          >
            Next →
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};

export { StrapiTable };
