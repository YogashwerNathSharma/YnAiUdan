import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateCoderWorkspaceChanges } from "./orchestrated-coder-adapter.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("orchestrated coder adapter", () => {
  it("connects LLM structured output to workspace changes", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/a.ts", content: "old" }] });
    const provider = { name: "test", chat: async () => ({ id: "test", model: "test", content: JSON.stringify({ summary: "updated", plan: ["edit"], patches: [{ path: "src/a.ts", operation: "update", content: "new" }] }) }) };
    const result = await generateCoderWorkspaceChanges(provider, { task: "update src/a.ts", workspace });
    assert.equal(result.summary, "updated");
    assert.equal(result.changes[0]?.operation, "update");
  });
});
