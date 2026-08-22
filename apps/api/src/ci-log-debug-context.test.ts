import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCiDebugContext } from "./ci-log-debug-context.js";

describe("CI log debug context", () => {
  it("includes only failed jobs and bounds log input", () => {
    const result = buildCiDebugContext(42, "abc1234", [
      { id: 1, name: "test", conclusion: "failure", log: "x".repeat(20000) },
      { id: 2, name: "build", conclusion: "success", log: "success" }
    ]);
    assert.equal(result.jobs.length, 2);
    assert.match(result.prompt, /Job 1 \(test\)/);
    assert.ok(result.prompt.length < 13000);
    assert.doesNotMatch(result.prompt, /Job 2 \(build\)/);
  });

  it("does not invent a failure when none is supplied", () => {
    const result = buildCiDebugContext(42, "abc1234", [{ id: 2, name: "build", conclusion: "success" }]);
    assert.match(result.prompt, /No failed GitHub Actions jobs/);
  });
});
