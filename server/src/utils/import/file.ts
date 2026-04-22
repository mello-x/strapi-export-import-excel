import * as fs from "node:fs";
import * as XLSX from "xlsx";

export function getFileInfo(
  file: any,
  defaultName = "unknown.xlsx"
): { fileName: string; fileExtension: string; filePath: string } {
  const fileName = file.name || file.originalFilename || defaultName;
  const fileExtension = fileName.split(".").pop().toLowerCase();
  const filePath = file.path || file.filepath;
  if (!filePath) throw new Error("File path not found");
  return { fileName, fileExtension, filePath };
}

export function cleanupFile(filePath: string): void {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function sheetToJson(sheet: XLSX.WorkSheet): Record<string, any>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  if (!rows.length) return rows;

  const headerCount = rows.reduce((max, r) => Math.max(max, Object.keys(r).length), 0);

  const result: Record<string, any>[] = [];
  for (const row of rows) {
    // Skip section-header/label rows (e.g. "Batch 1") — only 1 cell populated in a wide sheet
    if (Object.keys(row).length <= 1 && headerCount > 2) continue;

    const trimmed: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmed[key.trim()] = value;
    }
    result.push(trimmed);
  }
  return result;
}
