import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCollectionConfig } from "./settings";

describe("parseCollectionConfig", () => {
  it("accepts the settings the plugin defines", () => {
    assert.deepEqual(
      parseCollectionConfig({
        exportEnabled: false,
        importEnabled: true,
        exportFields: [{ key: "title", enabled: true }],
      }),
      { exportEnabled: false, importEnabled: true, exportFields: [{ key: "title", enabled: true }] }
    );
  });

  it("accepts a partial patch", () => {
    assert.deepEqual(parseCollectionConfig({ exportEnabled: false }), { exportEnabled: false });
  });

  it("rejects unknown keys", () => {
    assert.equal(parseCollectionConfig({ exportEnabled: true, evil: 1 }), null);
  });

  it("rejects wrong types", () => {
    assert.equal(parseCollectionConfig({ exportEnabled: "yes" }), null);
    assert.equal(parseCollectionConfig({ importEnabled: 1 }), null);
    assert.equal(parseCollectionConfig({ exportFields: "title" }), null);
    assert.equal(parseCollectionConfig({ exportFields: [{ key: 1, enabled: true }] }), null);
    assert.equal(parseCollectionConfig({ exportFields: [{ key: "a" }] }), null);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, "x", 3, [], [{ exportEnabled: true }]]) {
      assert.equal(parseCollectionConfig(value), null);
    }
  });
});
