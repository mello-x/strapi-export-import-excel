import { COMPONENT_STRIP_KEYS, SHORTCUT_FIELDS } from "../../constants";
import type { SchemaFieldSets } from "../../types";

export function resolveRelationForExport(relationValue: any): string | null {
  if (!relationValue || typeof relationValue !== "object" || Array.isArray(relationValue)) return null;

  for (const [fieldName, fieldValue] of Object.entries(relationValue)) {
    if (COMPONENT_STRIP_KEYS.includes(fieldName)) continue;
    if (fieldName.endsWith("Id") && fieldValue != null && typeof fieldValue !== "object") {
      return `${fieldName}:${fieldValue}`;
    }
  }

  for (const shortcutField of SHORTCUT_FIELDS) {
    if (relationValue[shortcutField]) return `${shortcutField}:${relationValue[shortcutField]}`;
  }

  for (const [fieldName, fieldValue] of Object.entries(relationValue)) {
    if (!COMPONENT_STRIP_KEYS.includes(fieldName) && fieldValue != null && typeof fieldValue !== "object") {
      return `${fieldName}:${fieldValue}`;
    }
  }
  return null;
}

export function flattenForXLSX(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([columnName, columnValue]) => [
      columnName,
      Array.isArray(columnValue) ? columnValue.join("|") : columnValue,
    ])
  );
}

export function getRepeatableComponentColumns(fieldName: string, componentUid: string, strapi: any): string[] {
  const compSchema = strapi.components?.[componentUid];
  if (!compSchema?.attributes) return [];

  return Object.entries<any>(compSchema.attributes)
    .filter(([key]) => !COMPONENT_STRIP_KEYS.includes(key))
    .map(([key]) => `${fieldName}.${key}`);
}

export function cleanComponentItem(item: any, componentUid: string, strapi: any): Record<string, any> {
  const compSchema = strapi.components?.[componentUid];
  const compAttributes = compSchema?.attributes ?? {};
  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(item)) {
    if (COMPONENT_STRIP_KEYS.includes(key)) continue;

    const fieldDef = compAttributes[key];

    if (fieldDef?.type === "relation") {
      if (Array.isArray(value)) {
        cleaned[key] = value
          .map((relItem: any) => resolveRelationForExport(relItem))
          .filter(Boolean)
          .join("|");
      } else {
        cleaned[key] = resolveRelationForExport(value) ?? value;
      }
    } else if (fieldDef?.type === "component") {
      cleaned[key] = value ? JSON.stringify(value) : null;
    } else if (value === null || value === undefined) {
      cleaned[key] = null;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.join("|");
    } else if (typeof value === "object") {
      cleaned[key] = JSON.stringify(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export function flattenSingleComponent(obj: any, prefix: string): Record<string, any> {
  const flat: Record<string, any> = {};
  if (!obj || typeof obj !== "object") return flat;
  for (const [fieldName, fieldValue] of Object.entries(obj)) {
    if (COMPONENT_STRIP_KEYS.includes(fieldName)) continue;
    const columnKey = `${prefix}_${fieldName}`;
    if (fieldValue === null || fieldValue === undefined) {
      flat[columnKey] = null;
    } else if (Array.isArray(fieldValue)) {
      flat[columnKey] = JSON.stringify(fieldValue);
    } else if (typeof fieldValue === "object") {
      Object.assign(flat, flattenSingleComponent(fieldValue, columnKey));
    } else {
      flat[columnKey] = fieldValue;
    }
  }
  return flat;
}

export function extractSchemaFieldSets(attributes: Record<string, any>, strapi: any): SchemaFieldSets {
  const customFields = Object.entries<any>(attributes)
    .filter(([, fieldDef]) => fieldDef.customField)
    .map(([fieldName]) => fieldName);
  const relationFields = Object.entries<any>(attributes)
    .filter(([, fieldDef]) => fieldDef.type === "relation")
    .map(([fieldName]) => fieldName);
  const skipFields = Object.entries<any>(attributes)
    .filter(([, fieldDef]) => fieldDef.type === "media")
    .map(([fieldName]) => fieldName);
  const repeatableComponentDefs = Object.entries<any>(attributes)
    .filter(([, fieldDef]) => fieldDef.type === "component" && fieldDef.repeatable)
    .map(([fieldName, fieldDef]) => ({ fieldName, componentUid: fieldDef.component }));
  const singleComponentFields = Object.entries<any>(attributes)
    .filter(([, fieldDef]) => fieldDef.type === "component" && !fieldDef.repeatable)
    .map(([fieldName]) => fieldName);

  const repeatableColumns: Record<string, string[]> = {};
  for (const { fieldName, componentUid } of repeatableComponentDefs) {
    repeatableColumns[fieldName] = getRepeatableComponentColumns(fieldName, componentUid, strapi);
  }

  return {
    customFields,
    relationFields,
    skipFields,
    repeatableComponentDefs,
    singleComponentFields,
    repeatableColumns,
  };
}

export function buildFlatFields(
  entry: any,
  fieldSets: SchemaFieldSets,
  systemKeys: Set<string> | string[]
): Record<string, any> {
  const isSystemKey =
    systemKeys instanceof Set ? (k: string) => systemKeys.has(k) : (k: string) => systemKeys.includes(k);
  const { customFields, relationFields, skipFields, repeatableComponentDefs, singleComponentFields } = fieldSets;
  const result: Record<string, any> = {};

  for (const fieldName in entry) {
    const fieldValue = entry[fieldName];
    if (isSystemKey(fieldName)) continue;
    if (customFields.includes(fieldName)) continue;
    if (skipFields.includes(fieldName)) continue;
    if (repeatableComponentDefs.some((def) => def.fieldName === fieldName)) continue;

    if (singleComponentFields.includes(fieldName)) {
      if (fieldValue && typeof fieldValue === "object") {
        Object.assign(result, flattenSingleComponent(fieldValue, fieldName));
      }
      continue;
    }

    if (fieldValue === null || typeof fieldValue !== "object") {
      result[fieldName] = fieldValue;
      continue;
    }

    if (!Array.isArray(fieldValue)) {
      if (relationFields.includes(fieldName)) {
        const resolved = resolveRelationForExport(fieldValue);
        result[fieldName] = resolved ? resolved.split(":").slice(1).join(":") : null;
      }
      continue;
    }

    if (fieldValue.length > 0 && typeof fieldValue[0] === "object" && relationFields.includes(fieldName)) {
      result[fieldName] = fieldValue
        .map((item) => {
          const resolved = resolveRelationForExport(item);
          return resolved ? resolved.split(":").slice(1).join(":") : null;
        })
        .filter(Boolean);
    } else {
      result[fieldName] = fieldValue;
    }
  }
  return result;
}

export function expandEntry(
  entry: any,
  fieldSets: SchemaFieldSets,
  systemKeys: Set<string> | string[],
  strapi: any
): Record<string, any>[] {
  const flatFields = flattenForXLSX(buildFlatFields(entry, fieldSets, systemKeys));
  const { repeatableComponentDefs, repeatableColumns } = fieldSets;

  if (repeatableComponentDefs.length === 0) {
    return [flatFields];
  }

  let maxItems = 0;
  const componentItems: Record<string, any[]> = {};

  for (const { fieldName, componentUid } of repeatableComponentDefs) {
    const items = Array.isArray(entry[fieldName]) ? entry[fieldName] : [];
    const cleaned = items.map((item: any) => cleanComponentItem(item, componentUid, strapi));
    componentItems[fieldName] = cleaned;
    maxItems = Math.max(maxItems, cleaned.length);
  }

  if (maxItems === 0) {
    const row = { ...flatFields };
    for (const { fieldName } of repeatableComponentDefs) {
      for (const col of repeatableColumns[fieldName] || []) {
        row[col] = null;
      }
    }
    return [row];
  }

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < maxItems; i++) {
    const row = { ...flatFields };
    for (const { fieldName } of repeatableComponentDefs) {
      const items = componentItems[fieldName];
      const item = items[i];
      const cols = repeatableColumns[fieldName] || [];
      if (item) {
        for (const col of cols) {
          const subField = col.split(".").slice(1).join(".");
          row[col] = item[subField] ?? null;
        }
      } else {
        for (const col of cols) {
          row[col] = null;
        }
      }
    }
    rows.push(row);
  }

  return rows;
}
