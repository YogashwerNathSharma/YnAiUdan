import test from "node:test";
import assert from "node:assert/strict";
import { critiqueExecution } from "./agent-critic.js";
import { verifyBeforeRelease } from "./agent-verification-gate.js";

test("critic accepts complete verified execution", () => {
  const result = critiqueExecution({
    goal: "build feature",
    artifacts: [{ path: "src/feature.ts", sha256: "abc", verificationStatus: "EXECUTION_VERIFIED" }],
    evidence: [{ kind: "EXECUTION_FINISHED", summary: "feature completed" }],
    verification: { passed: true, checks: [{ name: "tests", passed: true }] },
  });
  assert.equal(result.decision, "ACCEPT");
  assert.ok(result.score >= 80);
});

test("critic requires repair for missing required artifact", () => {
  const result = critiqueExecution({
    goal: "build feature",
    requiredArtifacts: ["feature.ts"],
    artifacts: [],
    evidence: [{ kind: "EXECUTION_FINISHED", summary: "done" }],
    verification: { passed: true, checks: [] },
  });
  assert.equal(result.decision, "REPAIR_REQUIRED");
  assert.deepEqual(result.missingArtifacts, ["feature.ts"]);
});

test("release gate blocks failed verification", () => {
  const result = verifyBeforeRelease({
    goal: "run tests",
    steps: [{ id: "1", status: "COMPLETED", output: { verification: { verified: false } } }],
    artifacts: [],
    evidence: [{ kind: "EXECUTION_FINISHED", summary: "tests finished" }],
  });
  assert.equal(result.passed, false);
  assert.equal(result.critic.decision, "REJECT");
});

test("release gate aggregates multiple successful steps", () => {
  const result = verifyBeforeRelease({
    goal: "run pipeline",
    steps: [
      { id: "1", status: "COMPLETED", output: { verification: { verified: true } } },
      { id: "2", status: "COMPLETED", output: { verification: { verified: true } } },
    ],
    artifacts: [{ path: "dist/app.js", sha256: "abc", verificationStatus: "VERIFIED" }],
    evidence: [{ kind: "EXECUTION_FINISHED", summary: "pipeline finished" }],
  });
  assert.equal(result.passed, true);
  assert.equal(result.critic.decision, "ACCEPT");
});
