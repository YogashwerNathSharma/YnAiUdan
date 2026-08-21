import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runCodingVerification } from "./coding-agent.js";

describe("coding agent orchestration", () => {
  it("reports verified only when verification and scope review both pass", async () => {
    const result = await runCodingVerification({
      role: "DEVELOPER",
      tenantId: "tenant",
      userId: "user",
      requestedPaths: ["src/app.ts"],
      changes: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1 }],
      commands: []
    });
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.fixAttempts, 0);
  });

  it("does not auto-fix beyond the configured attempt limit", async () => {
    let attempts = 0;
    const result = await runCodingVerification({
      role: "DEVELOPER",
      tenantId: "tenant",
      userId: "user",
      requestedPaths: ["src/app.ts"],
      changes: [{ path: "src/app.ts", status: "modified", additions: 4, deletions: 1 }],
      commands: ["pnpm definitely-not-a-real-command"],
      maxFixAttempts: 2,
      fix: async () => { attempts += 1; return true; }
    });
    assert.equal(result.status, "FAILED");
    assert.equal(attempts, 2);
  });
});
