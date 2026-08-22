import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewVerifyRepairWorkspace } from "./review-verify-repair-loop.js";
import type { WorkspaceChange } from "./workspace-context.js";

describe("autonomous engineer benchmark", () => {
  it("repairs a deterministic verification failure", async () => {
    const workspace = {
      tenantId: "benchmark",
      userId: "benchmark",
      baseRef: "main",
      files: [{ path: "src/target.ts", content: "export function target() { return 'broken'; }" }],
      changes: []
    };
    let repairCalls = 0;
    const result = await reviewVerifyRepairWorkspace({
      workspace,
      role: "engineer",
      userId: "benchmark",
      commands: ["test"],
      maxAttempts: 2,
      repair: async () => {
        repairCalls += 1;
        const change: WorkspaceChange = { path: "src/target.ts", content: "export function target() { return 'fixed'; }", reason: "deterministic benchmark repair" };
        return [change];
      }
    });
    assert.equal(result.status, "FIXED");
    assert.equal(repairCalls, 1);
    assert.equal(result.attempts, 1);
  });
});
