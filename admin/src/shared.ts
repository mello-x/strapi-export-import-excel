export interface Collection {
  uid: string;
  displayName: string;
  isLocalized: boolean;
  exportEnabled: boolean;
  importEnabled: boolean;
  /** What the signed-in admin may do per their Content Manager permissions (server-computed). */
  canExport?: boolean;
  canImport?: boolean;
}

export const PANEL_STYLE = { border: "1px solid #E3E3E8", borderRadius: "8px", padding: "28px" };

/**
 * Size the next request from how long the last one took, aiming at ~TARGET_MS each, so
 * no single request gets near a short reverse-proxy timeout however slow the host is.
 * Grows at most 2x per step. ponytail: assumes rows cost roughly the same; a sudden
 * very heavy batch can still overshoot once before the size shrinks.
 */
const TARGET_MS = 3000;
export const nextBatchSize = (size: number, elapsedMs: number, max: number): number =>
  Math.max(1, Math.min(max, size * 2, Math.round((size * TARGET_MS) / Math.max(elapsedMs, 1))));
