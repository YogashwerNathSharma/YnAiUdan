import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeGitHubEngineering } from "./github-engineer.js";

function mockClient() {
  const calls: string[] = [];
  return {
    calls,
    getRepository: async () => ({}), listBranches: async () => [], getFile: async () => ({}), push: async () => ({}),
    createBranch: async () => { calls.push("branch"); return { ref: "refs/heads/ai/fix" }; },
    commitChanges: async () => { calls.push("commit"); return { commitSha: "sha-1" }; },
    createPullRequest: async () => { calls.push("pr"); return { number: 1 }; },
    getCommitStatus: async () => { calls.push("ci"); return { state: "success" }; }
  };
}

describe("GitHub engineer integration", () => {
  it("runs the guarded branch -> commit -> PR -> CI sequence", async () => {
    const client = mockClient();
    const result = await executeGitHubEngineering({
      client,
      request: { owner: "YogashwerNathSharma", name: "YnAiUdan", sourceBranch: "main", workingBranch: "ai/fix", baseBranch: "main", title: "AI fix", message: "fix", approved: true, role: "DEVELOPER", tenantId: "tenant-1", allowedRepositories: ["YogashwerNathSharma/YnAiUdan"] },
      changes: [{ path: "src/a.ts", content: "export const a = 1;" }],
      waitForCi: true
    });
    assert.deepEqual(client.calls, ["branch", "commit", "pr", "ci"]);
    assert.equal((result.ci as { state: string }).state, "success");
  });

  it("blocks the workflow before any GitHub mutation when approval is missing", async () => {
    const client = mockClient();
    await assert.rejects(() => executeGitHubEngineering({
      client,
      request: { owner: "YogashwerNathSharma", name: "YnAiUdan", sourceBranch: "main", workingBranch: "ai/fix", baseBranch: "main", title: "AI fix", message: "fix", approved: false, role: "DEVELOPER", tenantId: "tenant-1", allowedRepositories: ["YogashwerNathSharma/YnAiUdan"] },
      changes: [{ path: "src/a.ts", content: "x" }]
    }), /safety gate blocked/);
    assert.deepEqual(client.calls, []);
  });
});
