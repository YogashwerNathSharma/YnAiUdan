import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspaceReference, workspaceReferenceKey } from "./workspace-reference.js";

describe("workspace reference", () => {
  it("keeps repository state as a lightweight immutable reference", () => {
    const ref = createWorkspaceReference({ tenantId: "t", userId: "u", repository: { owner: "YogashwerNathSharma", name: "YnAiUdan" }, baseRef: "main", commitSha: "0123456789abcdef0123456789abcdef01234567" });
    assert.equal(workspaceReferenceKey(ref), "YogashwerNathSharma/YnAiUdan@0123456789abcdef0123456789abcdef01234567");
    assert.equal(Object.isFrozen(ref), true);
  });

  it("rejects protected working branches", () => {
    assert.throws(() => createWorkspaceReference({ tenantId: "t", userId: "u", repository: { owner: "o", name: "r" }, baseRef: "main", workingBranch: "main" }), /protected/);
  });
});
