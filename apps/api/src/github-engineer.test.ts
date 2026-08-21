import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeGitHubEngineering } from "./github-engineer.js";

function client(status = { state: "success" }) {
  const calls: string[] = [];
  return {
    calls,
    getRepository: async () => ({}), listBranches: async () => [], getFile: async () => ({}),
    createBranch: async () => { calls.push("branch"); return {}; },
    commitChanges: async () => { calls.push("commit"); return { commitSha: "abc123" }; },
    push: async () => ({}),
    createPullRequest: async () => { calls.push("pr"); return { number: 1 }; },
    getCommitStatus: async () => { calls.push("ci"); return status; }
  };
}

describe("GitHub engineering workflow", () => {
  it("requires explicit approval", async () => {
    await assert.rejects(() => executeGitHubEngineering({ client: client(), request: { owner: "o", name: "r", sourceBranch: "main", workingBranch: "ai/fix", baseBranch: "main", title: "Fix", message: "fix", approved: false }, changes: [{ path: "src/a.ts", content: "x" }] }), /Explicit approval/);
  });

  it("creates branch, commit and PR and can inspect CI", async () => {
    const mock = client();
    const result = await executeGitHubEngineering({ client: mock, waitForCi: true, request: { owner: "o", name: "r", sourceBranch: "main", workingBranch: "ai/fix", baseBranch: "main", title: "Fix", message: "fix", approved: true }, changes: [{ path: "src/a.ts", content: "x" }] });
    assert.deepEqual(mock.calls, ["branch", "commit", "pr", "ci"]);
    assert.equal((result.ci as { state: string }).state, "success");
  });
});
