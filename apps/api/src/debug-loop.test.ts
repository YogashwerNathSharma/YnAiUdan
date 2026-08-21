import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runDebugLoop } from "./debug-loop.js";

describe("debug loop", () => {
  it("fixes and verifies within the attempt limit", async () => {
    let fixes = 0;
    const result = await runDebugLoop({
      failure: "TS2322 src/a.ts:4:1",
      fix: async () => { fixes += 1; return true; },
      verify: async () => ({ ok: fixes >= 2, message: "TS2322 src/a.ts:4:1" }),
      maxAttempts: 3
    });
    assert.equal(result.status, "FIXED");
    assert.equal(result.attempts.length, 2);
  });

  it("stops after bounded attempts", async () => {
    const result = await runDebugLoop({
      failure: "TS2322 src/a.ts:4:1",
      fix: async () => true,
      verify: async () => ({ ok: false, message: "still failing" }),
      maxAttempts: 2
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.attempts.length, 2);
  });
});
