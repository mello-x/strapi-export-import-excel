import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDroppedChanges } from "./compare";

describe("findDroppedChanges", () => {
  it("reports changed fields dropped inside components, ignoring unchanged ones", () => {
    const input = { title: "t", seo: { metaTitle: "new", keywords: "same" }, blocks: [{ id: 1, body: "x" }] };
    const sanitized = { title: "t", seo: {}, blocks: [{ id: 1 }] };
    const existing = { seo: { metaTitle: "old", keywords: "same" }, blocks: [{ id: 1, body: "x" }] };
    assert.deepEqual(findDroppedChanges(input, sanitized, existing), ["seo.metaTitle"]);
  });

  it("treats a dropped relation pointing at the stored target as unchanged", () => {
    const input = { category: { documentId: "c1" } };
    const existing = { category: { id: 3, documentId: "c1", name: "News" } };
    assert.deepEqual(findDroppedChanges(input, {}, existing), []);
    assert.deepEqual(findDroppedChanges({ category: { documentId: "c2" } }, {}, existing), ["category"]);
  });
});
