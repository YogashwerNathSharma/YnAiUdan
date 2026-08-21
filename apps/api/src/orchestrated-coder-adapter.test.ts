import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateCoderWorkspaceChanges } from "./orchestrated-coder-adapter.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("orchestrated coder adapter", () => {
  it("connects LLM structured output to workspace changes", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/a.ts", content: "old" }] });
    const result = await generateCoderWorkspaceChanges({ generate: async () => ({ model: "test", text: JSON.stringify({ summary: "updated", plan: ["edit"], patches: [{ path: "src/a.ts", content: "new" }] }) }) }, { task: "update src/a.ts", workspace });
    assert.equal(result.summary, "updated");
    assert.equal(result.changes[0].status, "modified");
  });
});
