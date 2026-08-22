import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCiRepairDecision } from "./ci-debug-repair-orchestrator.js";

describe("CI debug repair orchestrator", () => {
  it("routes retryable CI failures to DEBUG", () => {
    const result = createCiRepairDecision({ runId: 10, sha: "abc1234", jobs: [{ id: 1, name: "test", conclusion: "failure", log: "Error: test failed" }] });
    assert.equal(result.action, "DEBUG");
    assert.ok(result.diagnosis);
  });

  it("does not invoke diagnosis when there is no failed job", () => {
    const result = createCiRepairDecision({ runId: 10, sha: "abc1234", jobs: [{ id: 1, name: "test", conclusion: "success" }] });
    assert.equal(result.action, "NO_ACTION");
    assert.equal(result.diagnosis, undefined);
  });
});
