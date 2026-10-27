import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLUGIN_ID } from "../constants";
import { ARTICLE, type Call, makeAccess, makeStrapi } from "../testing/fakes";
import importService from "./import-service";
import nestedImportService from "./nested-import-service";

const parent = { id: 1, documentId: "doc1", items: [] };

const setup = () => {
  const services: Record<string, any> = {};
  const fake = makeStrapi({ documents: { [`${ARTICLE}.findFirst`]: parent }, services });
  services[`${PLUGIN_ID}.import-service`] = importService({ strapi: fake.strapi });
  return { ...fake, service: nestedImportService({ strapi: fake.strapi }) as any };
};
const rows = [{ title: "old", label: "one" }];
const run = (service: any, access: any, publish = true) =>
  service.importComponentBatch(rows, ARTICLE, "items", "title", null, publish, access);
const updates = (calls: Call[]) => calls.filter((c) => c.method === "update");

describe("nested import service permissions", () => {
  it("updates the component field through the sanitized input", async () => {
    const { service, calls } = setup();
    const result = await run(service, makeAccess());

    assert.equal(result.updated, 1);
    assert.deepEqual(updates(calls)[0].args[0].data, { items: [{ label: "one" }] });
  });

  it("does not update a parent the admin cannot update", async () => {
    const { service, calls } = setup();
    const result = await run(service, makeAccess({ canUpdate: () => false }));

    assert.match(result.errors.join("\n"), /not allowed to update/);
    assert.equal(updates(calls).length, 0);
  });

  it("does not publish a parent the admin cannot publish", async () => {
    const { service, calls } = setup();
    const result = await run(service, makeAccess({ canPublish: () => false }));

    assert.match(result.errors.join("\n"), /not allowed to publish/);
    assert.equal(updates(calls).length, 0);
  });

  it("updates without publishing when asked not to", async () => {
    const { service, calls } = setup();
    const result = await run(service, makeAccess({ canPublish: () => false }), false);

    assert.equal(result.updated, 1);
    assert.equal(updates(calls)[0].args[0].status, undefined);
  });

  it("does not write when the component field is not editable by the admin", async () => {
    const { service, calls } = setup();
    const result = await run(service, makeAccess({ sanitizeUpdateInput: async () => ({}) }));

    assert.match(result.errors.join("\n"), /not allowed to edit "items"/);
    assert.equal(updates(calls).length, 0);
  });
});
