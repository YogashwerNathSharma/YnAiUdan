import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverFromCiFailure } from "./github-ci-recovery.js";

function mockClient(states: string[]) {
  let index = 0;
  const commits: string[] = [];
  return {
    commits,
    getRepository: async () => ({}), listBranches: async () => [], getFile: async () => ({}), createBranch: async () => ({}), push: async () => ({}), createPullRequest: async () => ({}),
    commitChanges: async (_repo: unknown, _branch: string, _message: string, _changes: unknown[]) => { const sha = `commit-${commits.length + 1}`; commits.push(sha); return { commitSha: sha }; },
    getCommitStatus: async (_repo: unknown, sha: string) => ({ state: states[index++] ?? "failure", sha })
  };
}

describe("GitHub CI recovery", () => {
  it("checks CI against the exact recovery commit SHA", async () => {
    const client = mockClient(["success"]);
    const result = await recoverFromCiFailure({ client, repo: { owner: "o", name: "r" }, branch: "ai/fix", commitMessage: "fix CI", ciStatus: { state: "failure", message: "TS2322 src/a.ts:2:1" }, fix: async () => [{ path: "src/a.ts", content: "fixed" }] });
    assert.equal(result.status, "FIXED");
    assert.deepEqual(client.commits, ["commit-1"]);
    assert.equal(result.finalStatus.sha, "commit-1");
  });

  it("stops after the bounded number of attempts", async () => {
    const client = mockClient(["failure", "failure"]);
    const result = await recoverFromCiFailure({ client, repo: { owner: "o", name: "r" }, branch: "ai/fix", commitMessage: "fix CI", ciStatus: { state: "failure", message: "TS2322 src/a.ts:2:1" }, maxAttempts: 2, fix: async () => [{ path: "src/a.ts", content: "fixed" }] });
    assert.equal(result.status, "FAILED");
    assert.equal(result.attempts, 2);
  });
});
