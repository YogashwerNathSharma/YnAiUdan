import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewSource } from "./code-reviewer.js";

describe("source code reviewer", () => {
  it("flags likely hardcoded secrets", () => {
    const result = reviewSource([{ path: "src/config.ts", content: "const apiKey = 'secret-value';" }]);
    assert.equal(result.approved, false);
    assert.ok(result.findings.some(f => f.rule === "HARDCODED_SECRET"));
  });

  it("flags dangerous APIs without automatically blocking medium risk", () => {
    const result = reviewSource([{ path: "src/run.ts", content: "exec(command);" }]);
    assert.equal(result.approved, true);
    assert.ok(result.findings.some(f => f.rule === "DANGEROUS_API"));
  });
});
