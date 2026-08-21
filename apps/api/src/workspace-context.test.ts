import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyWorkspaceChanges, createWorkspaceContext } from "./workspace-context.js";

describe("shared workspace", () => {
  it("shares updated files and change state across agents", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/a.ts", content: "old" }] });
    const updated = applyWorkspaceChanges(workspace, [{ path: "src/a.ts", content: "new", status: "modified" }, { path: "src/b.ts", content: "b", status: "added" }]);
    assert.equal(updated.files.find(f => f.path === "src/a.ts")?.content, "new");
    assert.equal(updated.files.some(f => f.path === "src/b.ts"), true);
    assert.equal(updated.changes.length, 2);
  });

  it("removes deleted files", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/a.ts", content: "old" }] });
    const updated = applyWorkspaceChanges(workspace, [{ path: "src/a.ts", content: "", status: "deleted" }]);
    assert.equal(updated.files.some(f => f.path === "src/a.ts"), false);
  });
});
