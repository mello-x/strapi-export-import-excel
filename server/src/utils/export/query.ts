export const validateFilter = (filters: Record<string, any>, attributes: Record<string, any>): Record<string, any> => {
  if (!filters || typeof filters !== "object") return {};

  return Object.keys(filters).reduce(
    (acc, key) => {
      if (key.startsWith("$")) {
        acc[key] = Array.isArray(filters[key])
          ? filters[key].map((item: any) => validateFilter(item, attributes))
          : validateFilter(filters[key], attributes);
        return acc;
      }
      if (attributes[key]) {
        acc[key] = filters[key];
      }
      return acc;
    },
    {} as Record<string, any>
  );
};

export const buildDeepPopulate = (strapi: any, contentType: string, depth = 0, maxDepth = 5): Record<string, any> => {
  if (depth >= maxDepth) return {};

  const schema = strapi.contentTypes[contentType] ?? strapi.components?.[contentType];
  if (!schema?.attributes) return {};

  const populate: Record<string, any> = {};

  for (const [key, attr] of Object.entries<any>(schema.attributes)) {
    if (attr.type === "component") {
      const componentSchema = strapi.components?.[attr.component];
      if (componentSchema) {
        const nested = buildDeepPopulate(strapi, attr.component, depth + 1, maxDepth);
        populate[key] = Object.keys(nested).length > 0 ? { populate: nested } : true;
      }
    } else if (attr.type === "dynamiczone") {
      populate[key] = { populate: "*" };
    } else if (attr.type === "relation") {
      populate[key] = true;
    } else if (attr.type === "media") {
      populate[key] = true;
    }
  }

  return populate;
};

export const buildQuery = (
  filters: Record<string, any> = {},
  limit?: number,
  offset?: number,
  populate?: Record<string, any>
) => ({
  filters,
  populate: populate ?? ("*" as const),
  sort: "id:asc" as const,
  ...(limit !== undefined ? { limit } : {}),
  ...(offset !== undefined ? { start: offset } : {}),
});

export function getSearchableFields(contentTypeSchema: any): string[] {
  return Object.entries<any>(contentTypeSchema.attributes)
    .filter(
      ([fieldName, fieldDef]) =>
        ["string", "text", "richtext", "email", "uid", "enumeration"].includes(fieldDef.type) && fieldName !== "locale"
    )
    .map(([fieldName]) => fieldName);
}

export function getNumberFields(contentTypeSchema: any): string[] {
  return [
    ...Object.entries<any>(contentTypeSchema.attributes)
      .filter(([, fieldDef]) => ["number", "integer", "biginteger", "float", "decimal"].includes(fieldDef.type))
      .map(([fieldName]) => fieldName),
    "id",
  ];
}

export function parseFilters(filters: Record<string, any>): Record<string, any> {
  const parsed: Record<string, any> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (["page", "pageSize", "sort", "locale", "format", "contentType", "_q"].includes(key)) {
      continue;
    }

    if (key.startsWith("filters[")) {
      const match = key.match(/filters\[([^\]]+)\](?:\[(\d+)\])?\[([^\]]+)\](?:\[([^\]]+)\])?/);
      if (match) {
        const [, operator, index, field, condition] = match;
        if (!parsed.filters) parsed.filters = {};

        if (operator === "$and") {
          if (!parsed.filters.$and) parsed.filters.$and = [];
          const idx = parseInt(index, 10) || 0;
          if (!parsed.filters.$and[idx]) parsed.filters.$and[idx] = {};

          if (condition) {
            if (!parsed.filters.$and[idx][field]) parsed.filters.$and[idx][field] = {};
            parsed.filters.$and[idx][field][condition] = value;
          } else {
            parsed.filters.$and[idx][field] = value;
          }
        }
      }
    } else {
      parsed[key] = value;
    }
  }
  return parsed;
}
