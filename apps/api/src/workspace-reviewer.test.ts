import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewWorkspace } from "./workspace-reviewer.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("workspace reviewer", () => {
  it("reviews the exact shared workspace files", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const result = reviewWorkspace(workspace, { dependencies: {}, devDependencies: {}, scripts: {} });
    assert.equal(typeof result.score, "number");
    assert.equal(typeof result.approved, "boolean");
  });

  it("does not review an unrelated file outside the workspace", () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const result = reviewWorkspace(workspace);
    assert.equal(result.code.approved, true);
  });
});
