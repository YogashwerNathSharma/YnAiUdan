import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCiFailure } from "./ci-failure-analyzer.js";

test("classifies setup action failure as CI infrastructure", () => {
  const result = analyzeCiFailure({ jobs: [{ id: 1, name: "validate", conclusion: "failure", steps: [
    { name: "actions/checkout", conclusion: "success" },
    { name: "actions/setup-node@v4", conclusion: "failure" },
    { name: "pnpm typecheck", conclusion: "skipped" }
  ] }] });
  assert.equal(result.category, "CI_INFRA");
  assert.equal(result.repairable, false);
  assert.deepEqual(result.downstreamSkipped, ["pnpm typecheck"]);
});

test("classifies TypeScript errors as code failures", () => {
  const result = analyzeCiFailure({ jobs: [{ id: 2, name: "validate", conclusion: "failure", steps: [{ name: "typecheck", conclusion: "failure" }] }], log: "error TS2322: Type string is not assignable to type number" });
  assert.equal(result.category, "TYPE_ERROR");
  assert.equal(result.repairable, true);
});
