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
