import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

describe("GitHub write policy", () => {
  it("requires approval for pushes and merges", () => {
    assert.equal(requiresApproval("PUSH", "feature/test"), true);
    assert.equal(requiresApproval("MERGE", "feature/test"), true);
  });

  it("rejects protected branches", () => {
    assert.throws(() => validateBranchName("main"));
    assert.doesNotThrow(() => validateBranchName("feature/agent-work"));
  });
});
