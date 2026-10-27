import type { Core } from "@strapi/strapi";
import { getPluginStore, STORE_KEY } from "../constants";
import type { PluginSettings } from "../types";

/**
 * What the caller wants to do with a collection:
 * - "export": read its documents
 * - "import": create/update its documents
 * - "schema": inspect its fields (needs any of the above)
 */
export type Intent = "export" | "import" | "schema";

/**
 * Per-request view of what the authenticated admin may do with one content type.
 * Built on the content-manager permission checker, so the plugin enforces the exact
 * same rules (actions, field permissions, row conditions) as the Content Manager.
 */
export interface ContentTypeAccess {
  uid: string;
  canRead(): boolean;
  canCreate(): boolean;
  canUpdate(entity?: any): boolean;
  canPublish(entity?: any): boolean;
  /** Read access to another model, used before resolving relations that point at it. */
  canReadModel(uid: string): boolean;
  /** Editing a file's metadata (alt text) is a Media Library permission, not a content one. */
  canUpdateMedia(): boolean;
  /** Merges the caller's read conditions into `query` and drops fields they cannot read. */
  sanitizedReadQuery(query: Record<string, any>): Promise<Record<string, any>>;
  sanitizeOutput(entry: any): Promise<any>;
  sanitizeCreateInput(data: Record<string, any>): Promise<Record<string, any>>;
  sanitizeUpdateInput(entity: any, data: Record<string, any>): Promise<Record<string, any>>;
}

/** Only the collections the plugin lists (`api::*`) can be exported or imported. */
export const isManagedContentType = (strapi: Core.Strapi, uid: unknown): uid is string =>
  typeof uid === "string" &&
  uid.startsWith("api::") &&
  Boolean(strapi.contentTypes[uid as keyof typeof strapi.contentTypes]);

export const createContentTypeAccess = (strapi: Core.Strapi, userAbility: any, uid: string): ContentTypeAccess => {
  const permissionChecker = strapi.plugin("content-manager").service("permission-checker");
  const checkerFor = (model: string) => permissionChecker.create({ userAbility, model });
  const checker = checkerFor(uid);

  return {
    uid,
    canRead: () => Boolean(checker.can.read()),
    canCreate: () => Boolean(checker.can.create()),
    canUpdate: (entity) => Boolean(checker.can.update(entity)),
    canPublish: (entity) => Boolean(checker.can.publish(entity)),
    canReadModel: (model) => (model === uid ? Boolean(checker.can.read()) : Boolean(checkerFor(model).can.read())),
    canUpdateMedia: () => Boolean(userAbility.can("plugin::upload.assets.update")),
    sanitizedReadQuery: (query) => checker.sanitizedQuery.read(query),
    sanitizeOutput: (entry) => checker.sanitizeOutput(entry),
    sanitizeCreateInput: (data) => checker.sanitizeCreateInput(data),
    sanitizeUpdateInput: (entity, data) => checker.sanitizeUpdateInput(entity)(data),
  };
};

/**
 * Gate shared by every endpoint that touches a collection. Throws 404 for anything
 * the plugin does not manage, 403 when the collection is switched off in the plugin
 * settings or the admin lacks the Content Manager permission for `intent`.
 */
export const requireContentTypeAccess = async (
  strapi: Core.Strapi,
  ctx: any,
  uid: unknown,
  intent: Intent
): Promise<ContentTypeAccess> => {
  const userAbility = ctx.state?.userAbility;
  if (!userAbility) return ctx.throw(401, "Unauthorized");

  if (!isManagedContentType(strapi, uid)) return ctx.throw(404, "Content type not found");

  if (intent !== "schema") {
    const stored = (await getPluginStore(strapi).get({ key: STORE_KEY })) as PluginSettings | null;
    const config = stored?.collections?.[uid];
    if (intent === "export" && config?.exportEnabled === false) {
      return ctx.throw(403, "Export is disabled for this collection");
    }
    if (intent === "import" && config?.importEnabled === false) {
      return ctx.throw(403, "Import is disabled for this collection");
    }
  }

  const access = createContentTypeAccess(strapi, userAbility, uid);
  const allowed =
    intent === "export"
      ? access.canRead()
      : intent === "import"
        ? access.canCreate() || access.canUpdate()
        : access.canRead() || access.canCreate() || access.canUpdate();
  if (!allowed) return ctx.throw(403, "You are not allowed to access this content type");

  return access;
};
