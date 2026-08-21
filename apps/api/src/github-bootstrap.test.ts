import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { githubActionPolicy, validateGitRef } from "./github-policy.js";

describe("GitHub safety policy", () => {
  it("allows read actions without approval", () => {
    assert.deepEqual(githubActionPolicy("READ_REPOSITORY"), { allowed: true, requiresApproval: false });
  });

  it("requires approval for write actions", () => {
    assert.equal(githubActionPolicy("PUSH").requiresApproval, true);
  });

  it("rejects unsafe refs", () => {
    assert.equal(validateGitRef("../main"), false);
  });

  it("allows normal refs", () => {
    assert.equal(validateGitRef("feature/agent-work"), true);
  });
});
