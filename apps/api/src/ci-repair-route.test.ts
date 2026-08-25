import test from "node:test";
import assert from "node:assert/strict";
import { buildCiRepairPlan } from "./ci-repair-planner.js";

test("repair planner refuses to auto-fix setup failures", () => {
  const plan = buildCiRepairPlan({ jobs: [{ id: 1, name: "validate", conclusion: "failure", steps: [{ name: "actions/setup-node@v4", conclusion: "failure" }] }] });
  assert.equal(plan.nextAction, "REPAIR_CONFIG");
  assert.equal(plan.safeToAutoRepair, false);
});
