import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewVerifyRepairWorkspace } from "./review-verify-repair-loop.js";
import { createWorkspaceContext } from "./workspace-context.js";

describe("review verify repair integration", () => {
  it("moves from verification failure through repair to FIXED", async () => {
    const workspace = createWorkspaceContext({ tenantId: "t", userId: "u", baseRef: "main", files: [{ path: "src/app.ts", content: "broken" }] });
    const result = await reviewVerifyRepairWorkspace({
      workspace,
      role: "DEVELOPER",
      userId: "u",
      commands: ["node -e \"process.exit(require('node:fs').readFileSync('src/app.ts','utf8').includes('fixed')?0:1)\""],
      maxAttempts: 1,
      repair: async () => [{ path: "src/app.ts", operation: "update", content: "fixed" }]
    });
    assert.equal(result.status, "FIXED");
    assert.equal(result.attempts, 1);
    assert.equal(result.diagnoses.length, 1);
    assert.equal(result.workspace.files.find(file => file.path === "src/app.ts")?.content, "fixed");
  });
});
