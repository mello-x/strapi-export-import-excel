import type { CollectionConfig } from "../types";

/** Accepts only the settings the plugin defines; returns null when a value has the wrong shape. */
export const parseCollectionConfig = (value: unknown): CollectionConfig | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { exportEnabled, importEnabled, exportFields, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;

  const config: CollectionConfig = {};
  if (exportEnabled !== undefined) {
    if (typeof exportEnabled !== "boolean") return null;
    config.exportEnabled = exportEnabled;
  }
  if (importEnabled !== undefined) {
    if (typeof importEnabled !== "boolean") return null;
    config.importEnabled = importEnabled;
  }
  if (exportFields !== undefined) {
    if (!Array.isArray(exportFields)) return null;
    const fields: { key: string; enabled: boolean }[] = [];
    for (const field of exportFields) {
      if (typeof field?.key !== "string" || typeof field?.enabled !== "boolean") return null;
      fields.push({ key: field.key, enabled: field.enabled });
    }
    config.exportFields = fields;
  }
  return config;
};
