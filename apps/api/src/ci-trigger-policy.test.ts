import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ciTriggerForRef, selectCiRun } from "./ci-trigger-policy.js";

describe("ci trigger policy", () => {
  it("selects the newest run for the requested SHA and trigger", () => {
    const run = selectCiRun([
      { id: 1, head_sha: "abc", event: "push", created_at: "2026-01-01T00:00:00Z" },
      { id: 2, head_sha: "abc", event: "pull_request", created_at: "2026-01-02T00:00:00Z" },
      { id: 3, head_sha: "other", event: "pull_request", created_at: "2026-01-03T00:00:00Z" }
    ], "abc", "pull_request");
    assert.equal(run?.id, 2);
  });

  it("maps base ref pushes and non-base refs to their CI trigger", () => {
    assert.equal(ciTriggerForRef("main", "main"), "push");
    assert.equal(ciTriggerForRef("feature/test", "main"), "pull_request");
  });
});
