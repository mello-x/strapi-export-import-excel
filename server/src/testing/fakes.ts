import type { ContentTypeAccess } from "../utils/access";

export type Call = { uid: string; method: string; args: any[] };

type Flags = Partial<{ read: boolean; create: boolean; update: boolean; publish: boolean }>;

/** A ContentTypeAccess that allows everything unless overridden. */
export const makeAccess = (overrides: Partial<ContentTypeAccess> = {}): ContentTypeAccess => ({
  uid: "api::article.article",
  canRead: () => true,
  canCreate: () => true,
  canUpdate: () => true,
  canPublish: () => true,
  canReadModel: () => true,
  canUpdateMedia: () => true,
  sanitizedReadQuery: async (query) => query,
  sanitizeOutput: async (entry) => entry,
  sanitizeCreateInput: async (data) => data,
  sanitizeUpdateInput: async (_entity, data) => data,
  ...overrides,
});

/** Koa-like ctx: `throw` raises an exposed error carrying the status, like ctx.throw. */
export const makeCtx = (extra: Record<string, any> = {}, userAbility: unknown = {}) => ({
  state: userAbility ? { userAbility } : {},
  query: {},
  request: { body: {} },
  params: {},
  throw(status: number, message: string): never {
    throw Object.assign(new Error(message), { status, expose: true });
  },
  ...extra,
});

export const expectStatus = (status: number) => (error: any) => error?.status === status && error?.expose === true;

export const ARTICLE = "api::article.article";
export const TAG = "api::tag.tag";

export const schemas: Record<string, any> = {
  [ARTICLE]: {
    attributes: {
      title: { type: "string" },
      secret: { type: "string" },
      tag: { type: "relation", relation: "manyToOne", target: TAG },
      banner: { type: "media", multiple: false },
      items: { type: "component", repeatable: true, component: "shared.item" },
    },
  },
  [TAG]: { attributes: { name: { type: "string" } } },
};

export const components: Record<string, any> = {
  "shared.item": { attributes: { label: { type: "string" } } },
};

/**
 * Fake Strapi exposing only what the plugin touches. `permissions` drives the
 * content-manager permission checker per model; `documents` records every call.
 */
export const makeStrapi = (
  options: {
    permissions?: Record<string, Flags>;
    settings?: Record<string, any> | null;
    services?: Record<string, any>;
    documents?: Record<string, any>;
  } = {}
) => {
  const permissions = options.permissions ?? { [ARTICLE]: { read: true, create: true, update: true, publish: true } };
  const calls: Call[] = [];
  const documents = (uid: string) =>
    new Proxy(
      {},
      {
        get:
          (_target, method: string) =>
          async (...args: any[]) => {
            calls.push({ uid, method, args });
            const handler = options.documents?.[`${uid}.${method}`];
            return typeof handler === "function" ? handler(...args) : handler;
          },
      }
    );

  const checkerFor = (model: string) => {
    const flags = permissions[model] ?? {};
    return {
      can: {
        read: () => Boolean(flags.read),
        create: () => Boolean(flags.create),
        update: () => Boolean(flags.update),
        publish: () => Boolean(flags.publish),
      },
      sanitizedQuery: { read: async (query: any) => query },
      sanitizeOutput: async (entry: any) => entry,
      sanitizeCreateInput: async (data: any) => data,
      sanitizeUpdateInput: () => async (data: any) => data,
    };
  };

  const strapi: any = {
    contentTypes: { ...schemas, "admin::user": { attributes: {} } },
    components,
    log: { error() {}, warn() {} },
    store: () => ({ get: async () => (options.settings === undefined ? null : { collections: options.settings }) }),
    documents,
    db: { transaction: async (fn: any) => fn({ onRollback() {} }) },
    plugin: (name: string) => ({
      service: (service: string) => {
        if (name === "content-manager" && service === "permission-checker") {
          return { create: ({ model }: { model: string }) => checkerFor(model) };
        }
        return options.services?.[`${name}.${service}`];
      },
    }),
  };
  return { strapi, calls };
};
