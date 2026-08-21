import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnoseFailure } from "./debugger-agent.js";

describe("debugger diagnosis", () => {
  it("classifies TypeScript failures and extracts source locations", () => {
    const result = diagnoseFailure("TS2322 Type 'string' is not assignable to type 'number' src/user.ts:42:7");
    assert.equal(result.category, "TYPE_ERROR");
    assert.deepEqual(result.likelyFiles, ["src/user.ts"]);
    assert.equal(result.retryable, true);
  });

  it("uses evidence paths when the error text has no location", () => {
    const result = diagnoseFailure("test failed: expected 2 received 1", [{ source: "test", message: "assertion failed", path: "src/math.test.ts", line: 12 }]);
    assert.equal(result.category, "TEST_FAILURE");
    assert.deepEqual(result.likelyFiles, ["src/math.test.ts"]);
  });
});
