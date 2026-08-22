import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewVerifyRepairWorkspace } from "./review-verify-repair-loop.js";

const baseWorkspace = { tenantId: "benchmark", userId: "runner", baseRef: "main", files: [{ path: "src/target.ts", content: "export function target(): string { return 'broken'; }" }], changes: [] };

describe("phase 7 autonomous coding benchmark", () => {
  it("repairs a deterministic failing workspace and reaches FIXED", async () => {
    let repairs = 0;
    const result = await reviewVerifyRepairWorkspace({
      workspace: baseWorkspace,
      role: "developer",
      userId: "runner",
      commands: ["node -e \"process.exit(0)\""],
      maxAttempts: 2,
      repair: async () => {
        repairs += 1;
        return [{ path: "src/target.ts", content: "export function target(): string { return 'fixed'; }" }];
      }
    });
    assert.equal(result.status, "FIXED");
    assert.equal(repairs, 1);
    assert.ok(result.diagnoses.length >= 1);
  });
});
