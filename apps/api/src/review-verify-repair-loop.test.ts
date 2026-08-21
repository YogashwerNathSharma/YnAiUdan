import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewVerifyRepairWorkspace } from "./review-verify-repair-loop.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("review verify repair loop", () => {
  it("requires both review and verification to approve", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const result = await reviewVerifyRepairWorkspace({ workspace, role: "DEVELOPER", userId: "u", commands: [], repair: async () => null });
    assert.equal(result.status, "APPROVED");
  });

  it("does not approve when verification fails even if review passes", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const result = await reviewVerifyRepairWorkspace({ workspace, role: "DEVELOPER", userId: "u", commands: ["false"], maxAttempts: 1, repair: async () => null });
    assert.equal(result.status, "FAILED");
    assert.equal(result.verification[0].ok, false);
  });
});
