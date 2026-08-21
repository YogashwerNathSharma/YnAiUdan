import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAutoFixLoop } from "./auto-fix.js";

describe("bounded auto-fix loop", () => {
  it("never exceeds the configured attempt limit", async () => {
    let fixes = 0;
    const result = await runAutoFixLoop({
      role: "OWNER", tenantId: "tenant", userId: "user", maxAttempts: 2,
      commands: ["pnpm test"],
      fix: async () => { fixes += 1; return { toolName: "system.echo", input: { text: "fix" } }; }
    });
    assert.equal(result.attempts.length, 2);
    assert.equal(fixes, 1);
  });
});
