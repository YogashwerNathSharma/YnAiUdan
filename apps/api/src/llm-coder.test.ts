import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateWorkspaceChanges } from "./llm-coder.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("LLM coder adapter", () => {
  it("normalizes generated patches into workspace changes", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/a.ts", content: "old" }] });
    const changes = await generateWorkspaceChanges({ generate: async () => [{ path: "src/a.ts", content: "new" }, { path: "src/b.ts", content: "b" }] }, { task: "update code", workspace });
    assert.deepEqual(changes.map(c => c.status), ["modified", "added"]);
  });

  it("rejects unsafe generated paths", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main" });
    await assert.rejects(() => generateWorkspaceChanges({ generate: async () => [{ path: "../secret", content: "x" }] }, { task: "bad", workspace }), /Invalid generated path/);
  });
});
