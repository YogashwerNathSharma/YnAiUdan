import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runEngineeringPipeline } from "./engineering-pipeline.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("engineering pipeline", () => {
  it("runs generated code through review and verification", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const provider = { chat: async () => ({ id: "test", model: "test", content: JSON.stringify({ summary: "no-op", plan: ["review"], patches: [] }) }) };
    const result = await runEngineeringPipeline({ provider, workspace, task: "review", role: "DEVELOPER", userId: "u", commands: ["true"] });
    assert.equal(result.status, "APPROVED");
    assert.equal(result.summary, "no-op");
  });
});
