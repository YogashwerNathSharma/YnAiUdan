import type { UniversalIntent, UniversalModality } from "./universal-intelligence.js";
import { detectUniversalIntent } from "./universal-intelligence.js";
import type { CapabilityAgent, RoutedWorkItem } from "./capability-agent-router.js";
import { routeCapabilityAgent } from "./capability-agent-router.js";

export type DeliveryTarget =
  | "WEB_APP" | "ANDROID_APP" | "IOS_APP" | "API"
  | "DESKTOP_APP" | "DATABASE" | "IMAGE" | "VIDEO" | "AUDIO"
  | "DOCUMENT" | "DATA_PRODUCT" | "DEPLOYMENT";

export type FactoryPhase =
  | "DISCOVER" | "ARCHITECT" | "IMPLEMENT" | "INTEGRATE"
  | "VERIFY" | "RELEASE" | "OPERATE";

export type QualityGate = {
  id: string;
  phase: FactoryPhase;
  required: boolean;
  independent: boolean;
  acceptance: string;
};

export type FactoryWorkItem = RoutedWorkItem & {
  phase: FactoryPhase;
  target: DeliveryTarget;
  acceptanceCriteria: string[];
};

export type AutonomousFactoryPlan = {
  version: "2.0";
  goal: string;
  intent: UniversalIntent;
  targets: DeliveryTarget[];
  phases: FactoryPhase[];
  workItems: FactoryWorkItem[];
  waves: string[][];
  qualityGates: QualityGate[];
  approvalGates: Array<"EXTERNAL_SIDE_EFFECTS" | "DEPLOYMENT" | "DESTRUCTIVE_CHANGE">;
  completionContract: {
    generated: boolean;
    executed: boolean;
    verified: boolean;
    releasable: boolean;
  };
};

function targetFor(platform: string, modality: UniversalModality): DeliveryTarget {
  const p = platform.toUpperCase();
  if (p === "ANDROID") return "ANDROID_APP";
  if (p === "IOS") return "IOS_APP";
  if (p === "WEB") return "WEB_APP";
  if (p === "API") return "API";
  if (p === "IMAGE" || modality === "IMAGE") return "IMAGE";
  if (p === "VIDEO" || modality === "VIDEO") return "VIDEO";
  if (p === "AUDIO" || modality === "AUDIO") return "AUDIO";
  if (p === "DOCUMENT" || modality === "DOCUMENT") return "DOCUMENT";
  if (p === "DATA" || modality === "DATA") return "DATA_PRODUCT";
  if (p === "DATABASE") return "DATABASE";
  return "WEB_APP";
}

function acceptanceFor(agent: CapabilityAgent, target: DeliveryTarget): string[] {
  const common = ["Artifact exists", "Artifact provenance is recorded"];
  if (agent === "VERIFY_AGENT") return ["Independent verification evidence exists", "Acceptance criteria are evaluated"];
  if (target === "WEB_APP") return [...common, "Build completes", "Critical user flow is exercised"];
  if (target === "ANDROID_APP" || target === "IOS_APP") return [...common, "App build/package completes", "Critical user flow is exercised"];
  if (target === "IMAGE" || target === "VIDEO" || target === "AUDIO") return [...common, "Media artifact is readable/playable", "Requested format and dimensions/duration are satisfied"];
  if (target === "DOCUMENT") return [...common, "Document opens successfully", "Required sections are present"];
  return [...common, "Implementation executes successfully", "Relevant tests/checks pass"];
}

export function buildAutonomousFactoryPlan(goal: string, platform = "GENERAL"): AutonomousFactoryPlan {
  const intent = detectUniversalIntent(goal, platform);
  const targets = [...new Set(intent.modalities.map(modality => targetFor(platform, modality)))];
  const workItems: FactoryWorkItem[] = [];
  const root = routeCapabilityAgent({ workItemId: "factory-architect", capability: "architect requirements dependencies acceptance criteria " + goal, platform });
  workItems.push({
    ...root,
    phase: "ARCHITECT",
    target: targets[0] ?? "WEB_APP",
    parallelGroup: "architecture",
    expectedArtifacts: ["REQUIREMENTS", "ARCHITECTURE", "EXECUTION_PLAN"],
    acceptanceCriteria: ["Requirements are normalized", "Dependencies are explicit", "Acceptance criteria are testable"],
  });

  targets.forEach((target, index) => {
    const agent = routeCapabilityAgent({
      workItemId: `factory-build-${target.toLowerCase()}`,
      capability: goal,
      platform: target.replace("_APP", ""),
    });
    workItems.push({
      ...agent,
      phase: "IMPLEMENT",
      target,
      dependsOn: ["factory-architect"],
      parallelGroup: targets.length > 1 ? "implementation" : undefined,
      expectedArtifacts: ["WORK_RESULT"],
      acceptanceCriteria: acceptanceFor(agent.agent, target),
    });
  });

  const verify: FactoryWorkItem = {
    ...routeCapabilityAgent({ workItemId: "factory-verify", capability: "verify test qa compile lint regression benchmark", platform: "VERIFY" }),
    phase: "VERIFY",
    target: targets[0] ?? "WEB_APP",
    dependsOn: workItems.map(item => item.workItemId),
    parallelGroup: "verification",
    expectedArtifacts: ["VERIFICATION_REPORT"],
    acceptanceCriteria: acceptanceFor("VERIFY_AGENT", targets[0] ?? "WEB_APP"),
  };
  workItems.push(verify);

  const phases: FactoryPhase[] = ["DISCOVER", "ARCHITECT", "IMPLEMENT", "INTEGRATE", "VERIFY", "RELEASE", "OPERATE"];
  const waves = [
    ["factory-architect"],
    ...targets.map(target => [`factory-build-${target.toLowerCase()}`]),
    ["factory-verify"],
  ];

  return {
    version: "2.0",
    goal,
    intent,
    targets,
    phases,
    workItems,
    waves,
    qualityGates: [
      { id: "requirements", phase: "ARCHITECT", required: true, independent: false, acceptance: "All MUST requirements have explicit acceptance criteria or an approved decision." },
      { id: "implementation", phase: "IMPLEMENT", required: true, independent: false, acceptance: "Requested artifacts are generated in the project workspace." },
      { id: "execution", phase: "INTEGRATE", required: true, independent: true, acceptance: "Build/run/integration checks execute in a controlled environment." },
      { id: "verification", phase: "VERIFY", required: true, independent: true, acceptance: "A verifier/critic checks the result against the original goal, not merely model self-report." },
      { id: "release", phase: "RELEASE", required: true, independent: true, acceptance: "Only verified artifacts may be released or deployed." },
    ],
    approvalGates: ["EXTERNAL_SIDE_EFFECTS", "DEPLOYMENT", "DESTRUCTIVE_CHANGE"],
    completionContract: { generated: false, executed: false, verified: false, releasable: false },
  };
}
