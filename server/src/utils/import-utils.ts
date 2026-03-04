export const SYSTEM_KEYS = [
  "documentId",
  "locale",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "createdBy",
  "updatedBy",
  "localizations",
  "status",
];

export const SHORTCUT_FIELDS = ["email", "businessEmail", "name", "title", "tickerCode"];

export interface ImportBatch {
  contentType: string;
  locale: string | null;
  entries: any[];
}

export function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function parseJsonIfNeeded(value: any): any {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function setNestedPath(obj: Record<string, any>, path: string, value: any): void {
  const idx = path.indexOf("_");
  if (idx === -1) {
    obj[path] = value;
  } else {
    const key = path.slice(0, idx);
    const rest = path.slice(idx + 1);
    if (!obj[key] || typeof obj[key] !== "object") obj[key] = {};
    setNestedPath(obj[key], rest, value);
  }
}

export interface ImportResults {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function mergeResults(target: ImportResults, source: ImportResults): void {
  target.created += source.created;
  target.updated += source.updated;
  target.skipped += source.skipped;
  target.errors = target.errors.concat(source.errors);
}

export function hasChanges(existing: Record<string, any>, incoming: Record<string, any>): boolean {
  if (!incoming || typeof incoming !== "object") return false;
  if (!existing || typeof existing !== "object") return true;

  for (const key of Object.keys(incoming)) {
    if (SYSTEM_KEYS.includes(key)) continue;
    const newVal = incoming[key];
    const oldVal = existing[key];

    if (oldVal === undefined || newVal === undefined) continue;

    if (newVal === null || typeof newVal !== "object") {
      if (oldVal !== newVal) return true;
      continue;
    }

    if (Array.isArray(newVal)) {
      if (!Array.isArray(oldVal)) return true;
      if (newVal.length !== oldVal.length) return true;
      for (let i = 0; i < newVal.length; i++) {
        if (typeof newVal[i] === "object" && typeof oldVal[i] === "object" && hasChanges(oldVal[i], newVal[i])) {
          return true;
        } else if (typeof newVal[i] !== "object" && typeof oldVal[i] !== "object" && newVal[i] !== oldVal[i]) {
          return true;
        }
      }
      continue;
    }

    if (typeof newVal === "object" && typeof oldVal === "object") {
      if (hasChanges(oldVal, newVal)) return true;
    }
  }
  return false;
}
