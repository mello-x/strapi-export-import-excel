export function cleanSheetRows(rows: Record<string, any>[]): Record<string, any>[] {
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
