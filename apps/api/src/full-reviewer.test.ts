import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullReview } from "./full-reviewer.js";

describe("full review", () => {
  it("aggregates code, architecture and dependency findings", () => {
    const result = fullReview({
      files: [{ path: "src/app.ts", content: "const apiKey = 'secret';" }],
      packageJson: { dependencies: { example: "latest" } }
    });
    assert.equal(result.approved, false);
    assert.ok(result.code.findings.length > 0);
    assert.ok(result.architecture.findings.length > 0);
    assert.ok(result.dependencies.findings.length > 0);
  });
});
