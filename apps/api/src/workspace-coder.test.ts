import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCoderEdits, createCodingPlan } from "./workspace-coder.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("workspace coder", () => {
  it("creates a bounded coding plan and extracts target paths", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main" });
    const plan = createCodingPlan("update src/app.ts and src/routes.ts", workspace);
    assert.deepEqual(plan.targetPaths, ["src/app.ts", "src/routes.ts"]);
    assert.equal(plan.steps.length, 4);
  });

  it("marks existing files modified and new files added", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "old" }] });
    const result = applyCoderEdits(workspace, [{ path: "src/app.ts", content: "new" }, { path: "src/new.ts", content: "new" }]);
    assert.deepEqual(result.changes.map(change => change.status), ["modified", "added"]);
  });
});
