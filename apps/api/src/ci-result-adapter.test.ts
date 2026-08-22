import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectCiForCommit } from "./ci-result-adapter.js";

describe("ci result adapter", () => {
  it("returns explicit unknown when no run exists", async () => {
    const result = await inspectCiForCommit({ getRunsForCommit: async () => [], getJobs: async () => [] }, "o/r", "abc1234");
    assert.equal(result.status, "UNKNOWN");
  });

  it("rejects a run for a different SHA", async () => {
    const result = await inspectCiForCommit({
      getRunsForCommit: async () => [{ id: 41, head_sha: "other", status: "completed", conclusion: "success" }],
      getJobs: async () => []
    }, "o/r", "abc1234");
    assert.equal(result.status, "UNKNOWN");
  });

  it("maps failed jobs without inventing success", async () => {
    const result = await inspectCiForCommit({
      getRunsForCommit: async () => [{ id: 42, head_sha: "abc1234", event: "pull_request", status: "completed", conclusion: "failure" }],
      getJobs: async () => [{ id: 7, name: "test", conclusion: "failure" }, { id: 8, name: "build", conclusion: "success" }]
    }, "o/r", "abc1234", "pull_request");
    assert.equal(result.status, "FAILURE");
    assert.deepEqual(result.failedJobs.map(job => job.id), [7]);
  });

  it("selects the newest matching trigger when multiple runs exist", async () => {
    const result = await inspectCiForCommit({
      getRunsForCommit: async () => [
        { id: 1, head_sha: "abc1234", event: "pull_request", status: "completed", conclusion: "success", created_at: "2026-01-01T00:00:00Z" },
        { id: 2, head_sha: "abc1234", event: "pull_request", status: "completed", conclusion: "failure", created_at: "2026-01-02T00:00:00Z" }
      ],
      getJobs: async () => []
    }, "o/r", "abc1234", "pull_request");
    assert.equal(result.runId, 2);
    assert.equal(result.status, "FAILURE");
  });
});
