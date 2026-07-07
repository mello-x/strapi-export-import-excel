import type { ParsedSheet } from "./parseWorkbook";

// Rows/parent-groups per HTTP request. Small enough that a single batch finishes
// well under a typical reverse-proxy/load-balancer timeout (~60s), even with the
// heavy per-row work Strapi does on upsert. Tune down if batches ever get close.
const MAIN_BATCH_SIZE = 50;
const NESTED_GROUP_BATCH_SIZE = 25;

export interface BatchSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export type ProgressFn = (done: number, total: number) => void;

const emptySummary = (): BatchSummary => ({ created: 0, updated: 0, skipped: 0, errors: [] });

function mergeSummary(agg: BatchSummary, response: any): void {
  const result = response?.result ?? {};
  agg.created += result.created ?? 0;
  agg.updated += result.updated ?? 0;
  agg.skipped += result.skipped ?? 0;
  if (Array.isArray(result.errors)) agg.errors.push(...result.errors);
}

async function postBatch(url: string, body: Record<string, any>): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Import request failed");
  return data;
}

export interface RunImportParams {
  contentType: string;
  identifierField: string;
  publishOnImport: boolean;
  bulkLocaleUpload: boolean;
  locale: string | null;
}

/**
 * Drive the main import from the browser: parse-produced sheets are sent to the
 * server in small row batches, sequentially, aggregating results and reporting
 * progress. In bulk-locale mode each sheet is imported into its own locale
 * (sheet name = locale code); otherwise all sheets use the selected locale.
 */
export async function runImport(
  params: RunImportParams,
  sheets: ParsedSheet[],
  onProgress: ProgressFn
): Promise<BatchSummary> {
  const agg = emptySummary();
  const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  let done = 0;
  onProgress(done, total);

  for (const sheet of sheets) {
    const sheetLocale = params.bulkLocaleUpload ? sheet.name : params.locale;
    for (let i = 0; i < sheet.rows.length; i += MAIN_BATCH_SIZE) {
      const batch = sheet.rows.slice(i, i + MAIN_BATCH_SIZE);
      const response = await postBatch("/api/strapi-export-import-excel/import-batch", {
        contentType: params.contentType,
        identifierField: params.identifierField,
        publishOnImport: params.publishOnImport,
        locale: sheetLocale,
        rows: batch,
      });
      mergeSummary(agg, response);
      done += batch.length;
      onProgress(done, total);
    }
  }

  return agg;
}

export interface RunComponentImportParams {
  contentType: string;
  componentField: string;
  identifierField: string;
  bulkLocaleUpload: boolean;
  locale: string | null;
}

/**
 * Drive the nested (repeatable-component) import from the browser. Rows are first
 * grouped by parent identifier so every parent's rows stay together — the server
 * replaces a parent's component array wholesale, so a parent must never be split
 * across batches. Batches are sent as flattened row lists of whole parent groups.
 */
export async function runComponentImport(
  params: RunComponentImportParams,
  sheets: ParsedSheet[],
  onProgress: ProgressFn
): Promise<BatchSummary> {
  const agg = emptySummary();

  const sheetGroups = sheets.map((sheet) => {
    const groups = new Map<string, Record<string, any>[]>();
    for (const row of sheet.rows) {
      const idValue = row[params.identifierField];
      if (idValue == null || String(idValue).trim() === "") continue;
      const key = String(idValue);
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = [];
        groups.set(key, bucket);
      }
      bucket.push(row);
    }
    return {
      locale: params.bulkLocaleUpload ? sheet.name : params.locale,
      groups: [...groups.values()],
    };
  });

  const total = sheetGroups.reduce((sum, sg) => sum + sg.groups.length, 0);
  let done = 0;
  onProgress(done, total);

  for (const sg of sheetGroups) {
    for (let i = 0; i < sg.groups.length; i += NESTED_GROUP_BATCH_SIZE) {
      const groupSlice = sg.groups.slice(i, i + NESTED_GROUP_BATCH_SIZE);
      const rows = groupSlice.flat();
      const response = await postBatch("/api/strapi-export-import-excel/import-component-batch", {
        contentType: params.contentType,
        componentField: params.componentField,
        identifierField: params.identifierField,
        locale: sg.locale,
        rows,
      });
      mergeSummary(agg, response);
      done += groupSlice.length;
      onProgress(done, total);
    }
  }

  return agg;
}
