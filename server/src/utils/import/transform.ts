import { MEDIA_ALT_SUBFIELD } from "../../constants";

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

export function getRelationFieldDefs(
  attributes: Record<string, any>
): { field: string; target: string; relation: string }[] {
  return Object.entries<any>(attributes)
    .filter(([, attr]) => attr.type === "relation")
    .map(([fieldName, attr]) => ({ field: toCamel(fieldName), target: attr.target, relation: attr.relation }));
}

export function getComponentFieldNames(attributes: Record<string, any>): string[] {
  return Object.entries<any>(attributes)
    .filter(([, attr]) => attr.type === "component")
    .map(([fieldName]) => toCamel(fieldName));
}

export function mergeComponentData(
  data: Record<string, any>,
  existing: Record<string, any> | null,
  compFields: string[]
): Record<string, any> {
  for (const field of compFields) {
    const newValue = data[field];
    const oldValue = existing?.[field];

    if (!newValue || !oldValue) continue;

    if (!Array.isArray(newValue)) {
      if (oldValue?.id) data[field].id = oldValue.id;
      for (const key of Object.keys(data[field])) {
        if (Array.isArray(oldValue[key]) && !Array.isArray(data[field][key])) {
          data[field][key] = String(data[field][key]).split("|");
        }
      }
      continue;
    }

    if (Array.isArray(newValue) && Array.isArray(oldValue)) {
      data[field] = newValue.map((block: any, i: number) => {
        const oldBlock = oldValue[i];
        if (oldBlock?.id) return { id: oldBlock.id, ...block };
        for (const key of Object.keys(block)) {
          if (Array.isArray(oldBlock?.[key]) && !Array.isArray(block[key])) {
            block[key] = String(block[key]).split("|");
          }
        }
        return block;
      });
    }
  }

  return data;
}

/**
 * Row side-channel holding `<mediaField>.alternativeText` values. These describe the
 * *file* a media field points at, not the entry, so they must never reach
 * `strapi.documents().update()` — that would be read as "which file to link".
 */
export const MEDIA_ALT_KEY = "__mediaAlt";

/** Single (non-multiple) media fields, whose file alt text is editable from a sheet. */
export function getMediaAltFieldNames(attributes: Record<string, any>): string[] {
  return Object.entries<any>(attributes)
    .filter(([, attr]) => attr.type === "media" && !attr.multiple)
    .map(([fieldName]) => fieldName);
}

/**
 * Resolves a column header to the media field whose alt text it targets,
 * or null when the header is not a media alt column.
 */
export function parseMediaAltColumn(header: string, mediaAltFields: string[]): string | null {
  const idx = header.indexOf(".");
  if (idx === -1) return null;
  const field = header.slice(0, idx);
  const sub = header.slice(idx + 1);
  if (sub !== MEDIA_ALT_SUBFIELD) return null;
  return mediaAltFields.includes(field) ? field : null;
}
