import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLUGIN_ID } from "../constants";
import { ARTICLE, expectStatus, makeCtx, makeStrapi } from "../testing/fakes";
import importController from "./import-controller";

const batch = { contentType: ARTICLE, rows: [{ title: "a" }], identifierField: "title", componentField: "items" };

const setup = (flags: Record<string, boolean>, settings?: Record<string, any>) => {
  const received: Record<string, any[]> = {};
  const record =
    (name: string) =>
    async (...args: any[]) => {
      received[name] = args;
      return { created: 0, updated: 0, skipped: 0, mediaUpdated: 0, errors: [] };
    };
  const { strapi } = makeStrapi({
    permissions: { [ARTICLE]: flags },
    settings,
    services: {
      [`${PLUGIN_ID}.import-service`]: { importBatch: record("main") },
      [`${PLUGIN_ID}.nested-import-service`]: { importComponentBatch: record("nested") },
    },
  });
  return { controller: importController({ strapi }) as any, received };
};
const ctxWith = (body: Record<string, any>, userAbility: unknown = {}) => makeCtx({ request: { body } }, userAbility);

describe("import controller", () => {
  it("refuses an admin who can neither create nor update", async () => {
    const { controller, received } = setup({ read: true });
    await assert.rejects(controller.importBatch(ctxWith(batch)), expectStatus(403));
    await assert.rejects(controller.importComponentBatch(ctxWith(batch)), expectStatus(403));
    assert.deepEqual(received, {});
  });

  it("refuses a request without an admin ability", async () => {
    const { controller, received } = setup({ create: true, update: true });
    await assert.rejects(controller.importBatch(ctxWith(batch, null)), expectStatus(401));
    assert.deepEqual(received, {});
  });

  it("refuses a collection with import switched off", async () => {
    const { controller, received } = setup({ create: true, update: true }, { [ARTICLE]: { importEnabled: false } });
    await assert.rejects(controller.importBatch(ctxWith(batch)), expectStatus(403));
    assert.deepEqual(received, {});
  });

  it("refuses publishOnImport without publish permission", async () => {
    const { controller, received } = setup({ create: true, update: true });
    await assert.rejects(controller.importBatch(ctxWith({ ...batch, publishOnImport: true })), expectStatus(403));
    assert.deepEqual(received, {});
  });

  it("imports as draft without publish permission and passes the access through", async () => {
    const { controller, received } = setup({ create: true, update: true });
    await controller.importBatch(ctxWith(batch));

    const [, contentType, , identifierField, publish, , access] = received.main;
    assert.equal(contentType, ARTICLE);
    assert.equal(identifierField, "title");
    assert.equal(publish, false);
    assert.equal(access.uid, ARTICLE);
  });

  it("publishes a main import when asked and allowed", async () => {
    const { controller, received } = setup({ create: true, update: true, publish: true });
    await controller.importBatch(ctxWith({ ...batch, publishOnImport: true }));
    assert.equal(received.main[4], true);
  });

  it("refuses an explicit publish request on a nested import without publish permission", async () => {
    const { controller, received } = setup({ update: true });
    await assert.rejects(
      controller.importComponentBatch(ctxWith({ ...batch, publishOnImport: true })),
      expectStatus(403)
    );
    assert.deepEqual(received, {});
  });

  it("defaults a nested import to publishing only for admins who can publish", async () => {
    const cannot = setup({ update: true });
    await cannot.controller.importComponentBatch(ctxWith(batch));
    assert.equal(cannot.received.nested[5], false);

    const can = setup({ update: true, publish: true });
    await can.controller.importComponentBatch(ctxWith(batch));
    assert.equal(can.received.nested[5], true);
  });
});
