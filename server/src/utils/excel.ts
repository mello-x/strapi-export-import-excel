import * as XLSX from "xlsx";

/** Read an xlsx/xls file and return the workbook. */
export function readWorkbook(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath);
}

/** Get column headers (first row) from the first sheet of a workbook. */
export function getHeaders(filePath: string): string[] {
  const workbook = readWorkbook(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
  return (rows[0] ?? []).map(String);
}

/** Convert a worksheet to an array of row objects keyed by header. */
export function sheetToJson(sheet: XLSX.WorkSheet): Record<string, any>[] {
  return XLSX.utils.sheet_to_json(sheet);
}
