export interface ParsedSheet {
  name: string;
  rows: Record<string, any>[];
}

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  headers: string[];
}

/**
 * Mirrors the server's `cleanSheetRows`: trims header whitespace and drops
 * section-header/label rows (a single populated cell in an otherwise wide sheet).
 * Kept in sync so client-side row counts match what the server imports.
 */
function cleanRows(rows: Record<string, any>[]): Record<string, any>[] {
  if (!rows.length) return rows;

  const headerCount = rows.reduce((max, r) => Math.max(max, Object.keys(r).length), 0);

  const result: Record<string, any>[] = [];
  for (const row of rows) {
    if (Object.keys(row).length <= 1 && headerCount > 2) continue;

    const trimmed: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmed[key.trim()] = value;
    }
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse an uploaded Excel file entirely in the browser. `xlsx` is imported lazily
 * so it stays out of the plugin's main admin bundle until an import is started.
 */
export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets: ParsedSheet[] = workbook.SheetNames.map((name) => ({
    name,
    rows: cleanRows(XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[name])),
  }));

  const firstWithRows = sheets.find((sheet) => sheet.rows.length > 0);
  const headers = firstWithRows ? Object.keys(firstWithRows.rows[0]) : [];

  return { sheets, headers };
}
