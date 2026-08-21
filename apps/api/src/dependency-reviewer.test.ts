import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewDependencies } from "./dependency-reviewer.js";

describe("dependency reviewer", () => {
  it("flags install lifecycle scripts", () => {
    const result = reviewDependencies({ scripts: { install: "node setup.js" } });
    assert.equal(result.approved, false);
    assert.ok(result.findings.some(f => f.rule === "INSTALL_SCRIPT"));
  });

  it("flags unpinned dependencies", () => {
    const result = reviewDependencies({ dependencies: { example: "latest" } });
    assert.equal(result.approved, true);
    assert.ok(result.findings.some(f => f.rule === "UNPINNED_VERSION"));
  });
});
