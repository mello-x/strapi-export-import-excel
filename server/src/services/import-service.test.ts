import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARTICLE, type Call, makeAccess, makeStrapi, TAG } from "../testing/fakes";
import importService from "./import-service";

const setup = (documents: Record<string, any> = {}, services: Record<string, any> = {}) => {
  const fake = makeStrapi({ documents, services });
  return { ...fake, service: importService({ strapi: fake.strapi }) as any };
};
const writes = (calls: Call[]) => calls.filter((c) => c.method === "create" || c.method === "update");
const existing = { id: 1, documentId: "doc1", title: "old", publishedAt: null };

describe("import service permissions", () => {
  it("creates through the sanitized input", async () => {
    const { service, calls } = setup();
    const access = makeAccess({ sanitizeCreateInput: async (data) => ({ title: data.title }) });

    const result = await service.importBatch([{ title: "a", secret: "s" }], ARTICLE, null, null, false, 2, access);

    assert.equal(result.created, 1);
    const [write] = writes(calls);
    assert.equal(write.method, "create");
    assert.deepEqual(write.args[0].data, { title: "a" });
  });

  it("does not create without create permission", async () => {
    const { service, calls } = setup();
    const access = makeAccess({ canCreate: () => false });

    const result = await service.importBatch([{ title: "a" }], ARTICLE, null, null, false, 2, access);

    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.match(result.errors[0], /not allowed to create/);
    assert.equal(writes(calls).length, 0);
  });

  it("updates an existing entry through the sanitized input", async () => {
    const { service, calls } = setup({ [`${ARTICLE}.findFirst`]: existing });
    let sanitizedFor: unknown;
    const access = makeAccess({
      sanitizeUpdateInput: async (entity, data) => {
        sanitizedFor = entity;
        return { title: data.title };
      },
    });

    const result = await service.importBatch([{ title: "new", secret: "s" }], ARTICLE, null, "title", false, 2, access);

    assert.equal(result.updated, 1);
    assert.equal(sanitizedFor, existing);
    const [write] = writes(calls);
    assert.equal(write.method, "update");
    assert.equal(write.args[0].documentId, "doc1");
    assert.deepEqual(write.args[0].data, { title: "new" });
  });

  it("does not update an entry the admin cannot update", async () => {
    const { service, calls } = setup({ [`${ARTICLE}.findFirst`]: existing });
    const access = makeAccess({ canUpdate: () => false });

    const result = await service.importBatch([{ title: "new" }], ARTICLE, null, "title", false, 2, access);

    assert.equal(result.updated, 0);
    assert.match(result.errors[0], /not allowed to update/);
    assert.equal(writes(calls).length, 0);
  });

  it("checks update permission against the matched entry", async () => {
    const { service } = setup({ [`${ARTICLE}.findFirst`]: existing });
    const seen: unknown[] = [];
    const access = makeAccess({
      canUpdate: (entity) => {
        seen.push(entity);
        return true;
      },
    });

    await service.importBatch([{ title: "new" }], ARTICLE, null, "title", false, 2, access);

    assert.ok(seen.includes(existing));
  });

  it("does not publish without publish permission", async () => {
    const { service, calls } = setup({ [`${ARTICLE}.findFirst`]: existing });
    const access = makeAccess({ canPublish: () => false });

    const result = await service.importBatch([{ title: "old" }], ARTICLE, null, "title", true, 2, access);

    assert.match(result.errors[0], /not allowed to publish/);
    assert.equal(writes(calls).length, 0);
  });

  it("does not resolve relations to a collection the admin cannot read", async () => {
    const { service, calls } = setup({ [`${TAG}.findFirst`]: { documentId: "tag1" } });
    const access = makeAccess({ canReadModel: (uid) => uid !== TAG });

    const result = await service.importBatch([{ title: "a", tag: "name:t1" }], ARTICLE, null, null, false, 2, access);

    assert.match(result.errors[0], /not allowed to link api::tag\.tag/);
    assert.equal(calls.filter((c) => c.uid === TAG).length, 0, "target collection was queried");
    assert.equal(writes(calls).length, 0);
  });

  it("resolves relations to a readable collection", async () => {
    const { service, calls } = setup({ [`${TAG}.findFirst`]: { documentId: "tag1" } });

    const result = await service.importBatch(
      [{ title: "a", tag: "name:t1" }],
      ARTICLE,
      null,
      null,
      false,
      2,
      makeAccess()
    );

    assert.equal(result.created, 1);
    assert.deepEqual(writes(calls)[0].args[0].data.tag, { documentId: "tag1" });
  });

  describe("alt text", () => {
    const row = { title: "old", "banner.alternativeText": "alt" };
    const withBanner = { ...existing, banner: { id: 5, alternativeText: "" } };

    it("needs the Media Library permission", async () => {
      const updateFileInfo = [] as unknown[];
      const { service } = setup(
        { [`${ARTICLE}.findFirst`]: withBanner },
        { "upload.upload": { updateFileInfo: async (...args: unknown[]) => updateFileInfo.push(args) } }
      );

      const result = await service.importBatch(
        [row],
        ARTICLE,
        null,
        "title",
        false,
        2,
        makeAccess({ canUpdateMedia: () => false })
      );

      assert.equal(result.mediaUpdated, 0);
      assert.match(result.errors[0], /not allowed to edit media metadata/);
      assert.equal(updateFileInfo.length, 0);
    });

    it("is written when the admin may edit media", async () => {
      const updateFileInfo = [] as unknown[][];
      const { service } = setup(
        { [`${ARTICLE}.findFirst`]: withBanner },
        { "upload.upload": { updateFileInfo: async (...args: unknown[]) => updateFileInfo.push(args) } }
      );

      const result = await service.importBatch([row], ARTICLE, null, "title", false, 2, makeAccess());

      assert.equal(result.mediaUpdated, 1);
      assert.deepEqual(updateFileInfo[0], [5, { alternativeText: "alt" }]);
    });
  });
});
