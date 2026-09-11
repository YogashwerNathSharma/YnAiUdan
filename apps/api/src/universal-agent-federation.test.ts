import test from "node:test";
import assert from "node:assert/strict";
import { buildFederationPlan, materializeAgentEnvelopes } from "./universal-agent-federation.js";
import type { UniversalPlan } from "./universal-intelligence.js";

const plan: UniversalPlan = {
  intent: { goal: "build and verify a web app", modalities: ["TEXT", "CODE", "WEB"], languages: ["TypeScript"], platform: "WEB" },
  primaryAgent: "WEB_BUILDER",
  workItems: [
    { workItemId: "root", agent: "WEB_BUILDER", reason: "web build", parallelGroup: "build", risk: "HIGH", expectedArtifacts: ["WORK_RESULT"] },
    { workItemId: "verify", agent: "VERIFY_AGENT", reason: "verify", dependsOn: ["root"], parallelGroup: "verification", risk: "LOW", expectedArtifacts: ["VERIFICATION_REPORT"] },
  ],
  executionWaves: [["root"], ["verify"]],
  verificationRequired: true,
  executionRequired: true,
};

test("universal agent federation builds dependency-ordered specialist waves", () => {
  const federation = buildFederationPlan("task-1", "tenant-1", plan.intent.goal, plan);
  assert.deepEqual(federation.agents, ["WEB_BUILDER", "VERIFY_AGENT"]);
  assert.deepEqual(federation.waves.map(wave => wave.assignments[0]?.workItemId), ["root", "verify"]);
  assert.deepEqual(federation.waves[1]?.assignments[0]?.dependsOn, ["root"]);
});

test("universal agent federation materializes bounded agent envelopes", () => {
  const federation = buildFederationPlan("task-1", "tenant-1", plan.intent.goal, plan);
  const envelopes = materializeAgentEnvelopes({ taskId: "task-1", tenantId: "tenant-1", goal: plan.intent.goal, wave: federation.waves[0] });
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0]?.agent, "WEB_BUILDER");
  assert.equal(envelopes[0]?.status, "READY");
});
