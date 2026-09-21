import test from "node:test";
import assert from "node:assert/strict";
import { buildAutonomousFactoryPlan } from "./autonomous-factory.js";

test("builds a multi-target autonomous factory plan", () => {
  const plan = buildAutonomousFactoryPlan(
    "Build a web dashboard with an Android app, API, database, image assets and verification",
    "GENERAL",
  );

  assert.equal(plan.version, "2.0");
  assert.ok(plan.targets.includes("WEB_APP"));
  assert.ok(plan.targets.includes("ANDROID_APP"));
  assert.ok(plan.targets.includes("API"));
  assert.ok(plan.targets.includes("DATABASE"));
  assert.ok(plan.targets.includes("IMAGE"));
  assert.equal(plan.qualityGates.find(g => g.id === "verification")?.independent, true);
  assert.deepEqual(plan.waves[0], ["factory-architect"]);
  assert.deepEqual(plan.waves.at(-1), ["factory-verify"]);
});

test("keeps deployment and destructive changes behind approval gates", () => {
  const plan = buildAutonomousFactoryPlan("Refactor and deploy the application", "WEB");
  assert.ok(plan.approvalGates.includes("DEPLOYMENT"));
  assert.ok(plan.approvalGates.includes("DESTRUCTIVE_CHANGE"));
});
