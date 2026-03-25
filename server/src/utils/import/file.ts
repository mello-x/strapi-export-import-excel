import * as fs from "node:fs";

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
