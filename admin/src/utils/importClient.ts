import { PLUGIN_ID } from "../pluginId";
import { nextBatchSize, responseError } from "../shared";
import type { ParsedSheet } from "./parseWorkbook";

// Max rows/parent-groups per HTTP request. Batches start small and are resized from
// each request's duration (nextBatchSize), so they stay well under even a short
// reverse-proxy/load-balancer timeout; these caps only bound the fast case.
const MAIN_BATCH_SIZE = 50;
const NESTED_GROUP_BATCH_SIZE = 25;
const FIRST_BATCH_SIZE = 5;

export interface BatchSummary {
  created: number;
  updated: number;
  skipped: number;
  /** Files whose alternativeText was written via a `<mediaField>.alternativeText` column. */
  mediaUpdated: number;
  errors: string[];
}

export type ProgressFn = (done: number, total: number) => void;

/**
 * `<mediaField>.alternativeText` columns target the linked file's metadata, not the
 * entry, so they can never serve as the identifier column used to match entries.
 */
export const isMediaAltColumn = (header: string): boolean => header.endsWith(".alternativeText");

const emptySummary = (): BatchSummary => ({ created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] });

function mergeSummary(agg: BatchSummary, response: any, prefix: string): void {
  const result = response?.result ?? {};
  agg.created += result.created ?? 0;
  agg.updated += result.updated ?? 0;
  agg.skipped += result.skipped ?? 0;
  agg.mediaUpdated += result.mediaUpdated ?? 0;
  if (Array.isArray(result.errors)) agg.errors.push(...result.errors.map((e: string) => prefix + e));
}

/**
 * Send one batch and merge its result. A failed batch is recorded as an error naming
 * its rows instead of aborting, so the other batches still import and the user sees
 * exactly which rows to retry.
 */
async function postBatch(
  agg: BatchSummary,
  url: string,
  body: Record<string, any>,
  prefix: string,
  label: string
): Promise<void> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await responseError(response));
    mergeSummary(agg, await response.json(), prefix);
  } catch (error: any) {
    // After a proxy timeout the server may still have finished, so this says "failed", not "not imported"
    agg.errors.push(`${prefix}${label} failed: ${error.message}`);
  }
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
    const prefix = sheets.length > 1 ? `[${sheet.name}] ` : "";
    let size = FIRST_BATCH_SIZE;
    for (let i = 0; i < sheet.rows.length; ) {
      const batch = sheet.rows.slice(i, i + size);
      const began = performance.now();
      // Excel row numbers: row 1 is the header, so data row i is row i + 2
      const startRow = i + 2;
      await postBatch(
        agg,
        `/api/${PLUGIN_ID}/import-batch`,
        {
          contentType: params.contentType,
          identifierField: params.identifierField,
          publishOnImport: params.publishOnImport,
          locale: sheetLocale,
          startRow,
          rows: batch,
        },
        prefix,
        `Rows ${startRow}–${startRow + batch.length - 1}`
      );
      i += batch.length;
      size = nextBatchSize(size, performance.now() - began, MAIN_BATCH_SIZE);
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
      prefix: sheets.length > 1 ? `[${sheet.name}] ` : "",
      locale: params.bulkLocaleUpload ? sheet.name : params.locale,
      groups: [...groups.values()],
    };
  });

  const total = sheetGroups.reduce((sum, sg) => sum + sg.groups.length, 0);
  let done = 0;
  onProgress(done, total);

  for (const sg of sheetGroups) {
    let size = FIRST_BATCH_SIZE;
    for (let i = 0; i < sg.groups.length; ) {
      const groupSlice = sg.groups.slice(i, i + size);
      const began = performance.now();
      const rows = groupSlice.flat();
      const ids = groupSlice.map((group) => group[0][params.identifierField]);
      await postBatch(
        agg,
        `/api/${PLUGIN_ID}/import-component-batch`,
        {
          contentType: params.contentType,
          componentField: params.componentField,
          identifierField: params.identifierField,
          locale: sg.locale,
          rows,
        },
        sg.prefix,
        `${params.identifierField} ${ids[0]}…${ids[ids.length - 1]} (${ids.length} entries)`
      );
      i += groupSlice.length;
      size = nextBatchSize(size, performance.now() - began, NESTED_GROUP_BATCH_SIZE);
      done += groupSlice.length;
      onProgress(done, total);
    }
  }

  return agg;
}
