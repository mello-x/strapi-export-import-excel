import { SYSTEM_KEYS } from "../../constants";
import type { ImportResults } from "../../types";

export function mergeResults(target: ImportResults, source: ImportResults): void {
  target.created += source.created;
  target.updated += source.updated;
  target.skipped += source.skipped;
  target.errors = target.errors.concat(source.errors);
  target.warnings = target.warnings.concat(source.warnings);
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
