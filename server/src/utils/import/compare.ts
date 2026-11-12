import { SYSTEM_KEYS } from "../../constants";
import type { ImportResults } from "../../types";

export function mergeResults(target: ImportResults, source: ImportResults): void {
  target.created += source.created;
  target.updated += source.updated;
  target.skipped += source.skipped;
  target.mediaUpdated += source.mediaUpdated;
  target.errors = target.errors.concat(source.errors);
}

/** Strapi ValidationErrors list per-field details; their err.message is often just "2 errors occurred". */
export function describeError(err: any): string {
  const details = err?.details?.errors;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((e: any) => `${(e.path ?? []).join(".")}: ${e.message}`).join("; ");
  }
  return err?.message || JSON.stringify(err);
}

export function hasChanges(existing: Record<string, any>, incoming: Record<string, any>): boolean {
  if (!incoming || typeof incoming !== "object") return false;
  if (!existing || typeof existing !== "object") return true;

  for (const key of Object.keys(incoming)) {
    if (SYSTEM_KEYS.has(key)) continue;
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

const isBlank = (value: unknown) => value == null || value === "" || (Array.isArray(value) && value.length === 0);

/** Whether `value` differs from `stored`, looking only at the keys `value` sets (relations carry just a documentId). */
const differs = (stored: any, value: any): boolean => {
  if (value == null || typeof value !== "object") return stored !== value;
  if (stored == null || typeof stored !== "object") return true;
  if (Array.isArray(value)) {
    return !Array.isArray(stored) || stored.length !== value.length || value.some((v, i) => differs(stored[i], v));
  }
  return Object.keys(value).some((k) => k !== "id" && differs(stored[k], value[k]));
};

/**
 * Field paths the permission sanitizer dropped from `input` although the row changes them
 * (vs `existing`, or any non-blank value when creating). Values equal to the stored ones are
 * not reported, so a sheet carrying read-only columns (as exported) still imports.
 */
export function findDroppedChanges(input: any, sanitized: any, existing: any, prefix = ""): string[] {
  const dropped: string[] = [];
  if (Array.isArray(input)) {
    input.forEach((item, i) => {
      dropped.push(...findDroppedChanges(item, sanitized?.[i], existing?.[i], `${prefix}[${i}]`));
    });
    return dropped;
  }
  if (typeof input !== "object" || input == null || typeof sanitized !== "object" || sanitized == null) return dropped;

  for (const key of Object.keys(input)) {
    if (key === "id" || key === "__component" || SYSTEM_KEYS.has(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const value = input[key];
    const stored = existing?.[key];
    if (!(key in sanitized)) {
      const changed = isBlank(value) ? !isBlank(stored) : existing == null || differs(stored, value);
      if (changed) dropped.push(path);
    } else if (value != null && typeof value === "object") {
      dropped.push(...findDroppedChanges(value, sanitized[key], stored, path));
    }
  }
  return dropped;
}
