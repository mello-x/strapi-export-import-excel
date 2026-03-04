/**
 * Validates filter params against actual content type attributes.
 */
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

/**
 * Builds a Strapi documents().findMany() query object.
 */
export const buildQuery = (filters: Record<string, any> = {}, limit?: number, offset?: number) => ({
  filters,
  populate: "*" as const,
  sort: "id:asc" as const,
  ...(limit !== undefined ? { limit } : {}),
  ...(offset !== undefined ? { start: offset } : {}),
});
