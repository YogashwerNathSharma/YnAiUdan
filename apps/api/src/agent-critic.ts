export type CriticDecision = "ACCEPT" | "REPAIR_REQUIRED" | "REJECT";

export type CriticInput = {
  goal: string;
  requiredArtifacts?: string[];
  artifacts?: Array<{ path?: string | null; sha256?: string; verificationStatus?: string }>;
  evidence?: Array<{ kind: string; summary: string; data?: Record<string, unknown> }>;
  verification?: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; detail?: string }>;
  };
};

export type CriticResult = {
  decision: CriticDecision;
  score: number;
  reasons: string[];
  missingArtifacts: string[];
  failedChecks: string[];
};

function artifactMatches(required: string, artifact: CriticInput["artifacts"][number]): boolean {
  const value = `${artifact.path ?? ""} ${artifact.sha256 ?? ""}`.toLowerCase();
  return value.includes(required.toLowerCase());
}

/**
 * A non-mutating release critic. It deliberately does not call tools, models,
 * or modify the workspace. A model-based critic can be layered on later while
 * keeping this deterministic gate as the final safety floor.
 */
export function critiqueExecution(input: CriticInput): CriticResult {
  const reasons: string[] = [];
  const missingArtifacts: string[] = [];
  const failedChecks: string[] = [];
  const artifacts = input.artifacts ?? [];
  const required = [...new Set(input.requiredArtifacts ?? [])];

  if (!input.goal.trim()) reasons.push("Goal is empty");
  for (const requirement of required) {
    if (!artifacts.some(artifact => artifactMatches(requirement, artifact))) missingArtifacts.push(requirement);
  }

  for (const check of input.verification?.checks ?? []) {
    if (!check.passed) failedChecks.push(`${check.name}${check.detail ? `: ${check.detail}` : ""}`);
  }

  const unverifiedArtifacts = artifacts.filter(artifact => artifact.verificationStatus && artifact.verificationStatus !== "VERIFIED" && artifact.verificationStatus !== "EXECUTION_VERIFIED");
  const passedVerification = input.verification?.passed === true && failedChecks.length === 0;
  const evidenceCount = (input.evidence ?? []).length;

  if (missingArtifacts.length > 0) reasons.push(`Missing required artifacts: ${missingArtifacts.join(", ")}`);
  if (failedChecks.length > 0) reasons.push(`Verification checks failed: ${failedChecks.join(" | ")}`);
  if (!passedVerification) reasons.push("Independent verification gate did not pass");
  if (unverifiedArtifacts.length > 0) reasons.push(`${unverifiedArtifacts.length} artifact(s) are not independently verified`);
  if (evidenceCount === 0) reasons.push("No durable execution evidence was supplied");

  if (missingArtifacts.length > 0 || failedChecks.length > 0) {
    return { decision: "REPAIR_REQUIRED", score: 0, reasons, missingArtifacts, failedChecks };
  }
  if (!passedVerification || unverifiedArtifacts.length > 0 || evidenceCount === 0) {
    return { decision: "REJECT", score: Math.max(0, 100 - failedChecks.length * 20 - unverifiedArtifacts.length * 15), reasons, missingArtifacts, failedChecks };
  }

  const score = Math.min(100, 70 + Math.min(20, artifacts.length * 5) + Math.min(10, evidenceCount));
  reasons.push("Goal, required artifacts, verification, and evidence passed the deterministic critic");
  return { decision: "ACCEPT", score, reasons, missingArtifacts, failedChecks };
}
