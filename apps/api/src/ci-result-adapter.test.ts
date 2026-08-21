import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectCiForCommit } from "./ci-result-adapter.js";

describe("ci result adapter", () => {
  it("returns explicit unknown when no run exists", async () => {
    const result = await inspectCiForCommit({ getRunsForCommit: async () => [], getJobs: async () => [] }, "o/r", "abc1234");
    assert.equal(result.status, "UNKNOWN");
  });

  it("maps failed jobs without inventing success", async () => {
    const result = await inspectCiForCommit({
      getRunsForCommit: async () => [{ id: 42, head_sha: "abc1234", status: "completed", conclusion: "failure" }],
      getJobs: async () => [{ id: 7, name: "test", conclusion: "failure" }, { id: 8, name: "build", conclusion: "success" }]
    }, "o/r", "abc1234");
    assert.equal(result.status, "FAILURE");
    assert.deepEqual(result.failedJobs.map(job => job.id), [7]);
  });
});
