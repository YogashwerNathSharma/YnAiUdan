import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewArchitecture } from "./architecture-reviewer.js";

describe("architecture reviewer", () => {
  it("reports missing environment template as a low-risk finding", () => {
    const result = reviewArchitecture([{ path: "src/app.ts", content: "export const app = true;" }]);
    assert.ok(result.findings.some(f => f.rule === "MISSING_ENV_EXAMPLE"));
    assert.equal(result.approved, true);
  });

  it("detects large modules", () => {
    const result = reviewArchitecture([{ path: "src/large.ts", content: "x".repeat(150_001) }, { path: ".env.example", content: "" }]);
    assert.ok(result.findings.some(f => f.rule === "LARGE_MODULE"));
  });
});
