import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeEngineeringCommand } from "./engineering-orchestrator.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("engineering orchestrator", () => {
  it("rejects a command whose tenant does not match its workspace", async () => {
    const workspace = createWorkspaceContext({ tenantId: "tenant-a", userId: "user-a", baseRef: "main" });
    await assert.rejects(() => executeEngineeringCommand({ task: "review", tenantId: "tenant-b", userId: "user-a", role: "DEVELOPER", workspace, repository: { owner: "o", name: "r", defaultBranch: "main" }, workingBranch: "ai/review", allowedRepositories: ["o/r"], approved: true, title: "review", commitMessage: "review" }, { provider: { generate: async () => ({ text: "{}" }) }, github: {} as never }), /Tenant mismatch/);
  });
});
