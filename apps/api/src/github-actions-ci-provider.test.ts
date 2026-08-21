import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGitHubActionsCiProvider } from "./github-actions-ci-provider.js";

describe("github actions ci provider", () => {
  it("delegates commit runs and jobs to the GitHub Actions API", async () => {
    const calls: string[] = [];
    const provider = createGitHubActionsCiProvider({
      listRuns: async (repo, sha) => { calls.push(`runs:${repo}:${sha}`); return []; },
      listJobs: async (repo, runId) => { calls.push(`jobs:${repo}:${runId}`); return []; }
    });
    await provider.getRunsForCommit("o/r", "abc1234");
    await provider.getJobs("o/r", 42);
    assert.deepEqual(calls, ["runs:o/r:abc1234", "jobs:o/r:42"]);
  });
});
