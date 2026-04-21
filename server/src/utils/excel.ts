import type ExcelJS from "exceljs";

function extractCellValue(value: ExcelJS.CellValue): any {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return (value as any).result;
    if ("richText" in value) return (value as any).richText.map((r: any) => r.text).join("");
    if ("text" in value) return (value as any).text;
    if ("error" in value) return null;
  }
  return value;
}

export function worksheetToJson(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const rows: Record<string, any>[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(extractCellValue(cell.value) ?? `Column${colNumber}`);
      });
      return;
    }

    const obj: Record<string, any> = {};
    let hasData = false;
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        const val = extractCellValue(cell.value);
        if (val !== null && val !== undefined) {
          obj[header] = val;
          hasData = true;
        }
      }
    });
    if (hasData) rows.push(obj);
  });

  return rows;
}

export function worksheetGetHeaders(worksheet: ExcelJS.Worksheet): string[] {
  const firstRow = worksheet.getRow(1);
  if (!firstRow || firstRow.cellCount === 0) return [];

  const headers: string[] = [];
  firstRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(extractCellValue(cell.value) ?? "");
  });
  return headers.filter(Boolean);
}

export function addJsonToWorksheet(
  worksheet: ExcelJS.Worksheet,
  data: Record<string, any>[],
  headers?: string[]
): void {
  const keys = headers || Object.keys(data[0] || {});
  worksheet.addRow(keys);
  for (const row of data) {
    worksheet.addRow(keys.map((k) => row[k] ?? null));
  }
}
