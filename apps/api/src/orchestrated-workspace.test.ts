import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspaceContext } from "./workspace-context.js";
import { runWorkspaceOrchestration } from "./orchestrated-workspace.js";

describe("workspace orchestration", () => {
  it("passes workspace changes from coder to reviewer and github", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main" });
    const seen: string[][] = [];
    const result = await runWorkspaceOrchestration(workspace, { task: "add feature", tenantId: "t", userId: "u", role: "DEVELOPER" }, {
      CODER: async () => ({ agent: "CODER", status: "SUCCESS", summary: "coded", changes: [{ path: "src/a.ts", content: "new", status: "added" }] }),
      REVIEWER: async ({ workspace }) => { seen.push(workspace.files.map(f => f.path)); return { agent: "REVIEWER", status: "SUCCESS", summary: "reviewed" }; },
      GITHUB: async ({ workspace }) => { seen.push(workspace.files.map(f => f.path)); return { agent: "GITHUB", status: "SUCCESS", summary: "ready" }; }
    });
    assert.equal(result.status, "SUCCESS");
    assert.deepEqual(seen, [["src/a.ts"], ["src/a.ts"]]);
  });
});
