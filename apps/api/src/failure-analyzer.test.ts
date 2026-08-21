import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeFailure } from "./failure-analyzer.js";

describe("failure analyzer", () => {
  it("classifies TypeScript failures and extracts files", () => {
    const result = analyzeFailure("pnpm typecheck", "", "src/auth.ts:12:4 error TS2322: Type mismatch");
    assert.equal(result.category, "TYPECHECK");
    assert.deepEqual(result.likelyFiles, ["src/auth.ts"]);
    assert.equal(result.retryable, true);
  });

  it("does not recommend retrying missing commands or permissions", () => {
    assert.equal(analyzeFailure("pnpm test", "", "command not found").retryable, false);
    assert.equal(analyzeFailure("pnpm test", "", "permission denied").retryable, false);
  });
});
