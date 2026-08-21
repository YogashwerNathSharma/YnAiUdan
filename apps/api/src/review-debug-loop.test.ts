import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewAndRepairWorkspace } from "./review-debug-loop.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("review debugger repair loop", () => {
  it("approves a clean workspace without repair", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "export const app = true;" }] });
    const result = await reviewAndRepairWorkspace({ workspace, repair: async () => null });
    assert.equal(result.status, "APPROVED");
    assert.equal(result.attempts, 0);
  });

  it("repairs a retryable review failure within the bound", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "const apiKey = 'secret-value';" }] });
    const result = await reviewAndRepairWorkspace({ workspace, maxAttempts: 2, repair: async () => [{ path: "src/app.ts", content: "const apiKey = process.env.API_KEY;", status: "modified" }] });
    assert.equal(result.status, "FIXED");
    assert.equal(result.attempts, 1);
  });
});
