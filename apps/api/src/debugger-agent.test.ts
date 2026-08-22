import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnoseFailure } from "./debugger-agent.js";

describe("debugger agent", () => {
  it("classifies TypeScript failures as retryable", () => {
    const result = diagnoseFailure("TS2322: Type is not assignable to type string");
    assert.equal(result.category, "TYPE_ERROR");
    assert.equal(result.retryable, true);
  });

  it("keeps dependency failures out of automatic repair", () => {
    const result = diagnoseFailure("ERR_PNPM_NO_MATCHING_VERSION No matching version found");
    assert.equal(result.category, "DEPENDENCY_ERROR");
    assert.equal(result.retryable, false);
  });

  it("fails closed for unknown errors", () => {
    const result = diagnoseFailure("some unfamiliar infrastructure failure");
    assert.equal(result.category, "UNKNOWN");
    assert.equal(result.retryable, false);
  });
});
