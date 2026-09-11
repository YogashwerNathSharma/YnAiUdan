import { describe, expect, it } from "vitest";
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

describe("universal agent federation", () => {
  it("builds dependency-ordered specialist waves", () => {
    const federation = buildFederationPlan("task-1", "tenant-1", plan.intent.goal, plan);
    expect(federation.agents).toEqual(["WEB_BUILDER", "VERIFY_AGENT"]);
    expect(federation.waves.map(wave => wave.assignments[0]?.workItemId)).toEqual(["root", "verify"]);
    expect(federation.waves[1]?.assignments[0]?.dependsOn).toEqual(["root"]);
  });

  it("materializes bounded agent envelopes", () => {
    const federation = buildFederationPlan("task-1", "tenant-1", plan.intent.goal, plan);
    const envelopes = materializeAgentEnvelopes({ taskId: "task-1", tenantId: "tenant-1", goal: plan.intent.goal, wave: federation.waves[0] });
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]?.agent).toBe("WEB_BUILDER");
    expect(envelopes[0]?.status).toBe("READY");
  });
});
