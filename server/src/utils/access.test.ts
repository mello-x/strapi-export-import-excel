import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARTICLE, expectStatus, makeCtx, makeStrapi } from "../testing/fakes";
import { isManagedContentType, requireContentTypeAccess } from "./access";

const full = { [ARTICLE]: { read: true, create: true, update: true, publish: true } };

describe("isManagedContentType", () => {
  const { strapi } = makeStrapi();

  it("only accepts existing api:: content types", () => {
    assert.equal(isManagedContentType(strapi, ARTICLE), true);
    assert.equal(isManagedContentType(strapi, "api::missing.missing"), false);
    assert.equal(isManagedContentType(strapi, "admin::user"), false);
    assert.equal(isManagedContentType(strapi, "plugin::users-permissions.user"), false);
    assert.equal(isManagedContentType(strapi, undefined), false);
    assert.equal(isManagedContentType(strapi, ["api::article.article"]), false);
  });
});

describe("requireContentTypeAccess", () => {
  it("answers 401 without an admin ability", async () => {
    const { strapi } = makeStrapi({ permissions: full });
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx({}, null), ARTICLE, "export"), expectStatus(401));
  });

  it("answers 404 for content types the plugin does not manage", async () => {
    const { strapi } = makeStrapi({ permissions: full });
    for (const uid of ["admin::user", "api::missing.missing", undefined]) {
      await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), uid, "export"), expectStatus(404));
    }
  });

  it("answers 403 when the admin cannot read", async () => {
    const { strapi } = makeStrapi({ permissions: { [ARTICLE]: { create: true } } });
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "export"), expectStatus(403));
  });

  it("lets an admin who can only create or only update import", async () => {
    for (const flags of [{ create: true }, { update: true }]) {
      const { strapi } = makeStrapi({ permissions: { [ARTICLE]: flags } });
      const access = await requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "import");
      assert.equal(access.uid, ARTICLE);
    }
  });

  it("answers 403 to import without create or update", async () => {
    const { strapi } = makeStrapi({ permissions: { [ARTICLE]: { read: true, publish: true } } });
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "import"), expectStatus(403));
  });

  it("lets the schema be read with any of read, create or update", async () => {
    for (const flags of [{ read: true }, { create: true }, { update: true }]) {
      const { strapi } = makeStrapi({ permissions: { [ARTICLE]: flags } });
      await requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "schema");
    }
    const { strapi } = makeStrapi({ permissions: { [ARTICLE]: { publish: true } } });
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "schema"), expectStatus(403));
  });

  it("refuses export and import switched off in the plugin settings", async () => {
    const { strapi } = makeStrapi({
      permissions: full,
      settings: { [ARTICLE]: { exportEnabled: false, importEnabled: false } },
    });
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "export"), expectStatus(403));
    await assert.rejects(requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "import"), expectStatus(403));
    await requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "schema");
  });

  it("treats a collection missing from the settings as enabled", async () => {
    const { strapi } = makeStrapi({ permissions: full, settings: {} });
    await requireContentTypeAccess(strapi, makeCtx(), ARTICLE, "export");
  });
});
