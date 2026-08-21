import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCodingVerification } from "./coding-agent.js";

describe("coding agent orchestration", () => {
  it("requires the full review gate for verification", async () => {
    const result = await runCodingVerification({
      role: "DEVELOPER",
      tenantId: "tenant",
      userId: "user",
      requestedPaths: ["src/app.ts"],
      changes: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1 }],
      reviewFiles: [{ path: "src/app.ts", content: "export const app = true;" }],
      commands: []
    });
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.fixAttempts, 0);
  });

  it("blocks verification when review detects a hardcoded secret", async () => {
    const result = await runCodingVerification({
      role: "DEVELOPER",
      tenantId: "tenant",
      userId: "user",
      requestedPaths: ["src/app.ts"],
      changes: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1 }],
      reviewFiles: [{ path: "src/app.ts", content: "const apiKey = 'secret-value';" }],
      commands: []
    });
    assert.equal(result.status, "NEEDS_REVIEW");
    assert.equal(result.fullReview.approved, false);
  });

  it("does not auto-fix beyond the configured attempt limit", async () => {
    let attempts = 0;
    const result = await runCodingVerification({
      role: "DEVELOPER",
      tenantId: "tenant",
      userId: "user",
      requestedPaths: ["src/app.ts"],
      changes: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1 }],
      reviewFiles: [{ path: "src/app.ts", content: "export const app = true;" }],
      commands: ["pnpm definitely-not-a-real-command"],
      maxFixAttempts: 2,
      fix: async () => { attempts += 1; return true; }
    });
    assert.equal(result.status, "FAILED");
    assert.equal(attempts, 2);
  });
});
