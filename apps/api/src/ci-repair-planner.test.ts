import test from "node:test";
import assert from "node:assert/strict";
import { buildCiRepairPlan } from "./ci-repair-planner.js";

test("CI infrastructure failures never become automatic code repairs", () => {
  const plan = buildCiRepairPlan({ jobs: [{ id: 1, name: "validate", conclusion: "failure", steps: [{ name: "actions/setup-node@v4", conclusion: "failure" }, { name: "pnpm typecheck", conclusion: "skipped" }] }] });
  assert.equal(plan.category, "CI_INFRA");
  assert.equal(plan.safeToAutoRepair, false);
  assert.equal(plan.requiresHumanApproval, true);
  assert.equal(plan.nextAction, "REPAIR_CONFIG");
});

test("known code failures produce a guarded repair plan", () => {
  const plan = buildCiRepairPlan({ jobs: [{ id: 2, name: "validate", conclusion: "failure", steps: [{ name: "typecheck", conclusion: "failure" }] }], log: "error TS2322: Type string is not assignable to type number" });
  assert.equal(plan.category, "TYPE_ERROR");
  assert.equal(plan.safeToAutoRepair, true);
  assert.equal(plan.requiresHumanApproval, true);
  assert.ok(plan.steps.length >= 4);
});
