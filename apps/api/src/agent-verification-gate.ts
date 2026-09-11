import { critiqueExecution, type CriticResult } from "./agent-critic.js";

export type VerificationGateInput = {
  goal: string;
  steps: Array<{ id: string; status: string; output?: unknown; error?: string | null }>;
  artifacts: Array<{ path?: string | null; sha256?: string; verificationStatus?: string }>;
  evidence: Array<{ kind: string; summary: string; data?: Record<string, unknown> }>;
};

export type VerificationGateResult = {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  critic: CriticResult;
};

function outputVerification(output: unknown): boolean | undefined {
  if (!output || typeof output !== "object") return undefined;
  const verification = (output as Record<string, unknown>).verification;
  if (!verification || typeof verification !== "object") return undefined;
  const value = (verification as Record<string, unknown>).verified;
  return typeof value === "boolean" ? value : undefined;
}

/** Release gate: aggregate every step, every artifact and the durable ledger.
 * It never mutates execution state and therefore cannot approve its own work.
 */
export function verifyBeforeRelease(input: VerificationGateInput): VerificationGateResult {
  const checks: VerificationGateResult["checks"] = [];
  const failedSteps = input.steps.filter(step => step.status === "FAILED");
  const nonCompleted = input.steps.filter(step => step.status !== "COMPLETED");
  const toolSteps = input.steps.filter(step => {
    if (!step.output || typeof step.output !== "object") return true;
    return "result" in (step.output as Record<string, unknown>);
  });
  const verificationResults = toolSteps.map(step => outputVerification(step.output)).filter((value): value is boolean => typeof value === "boolean");

  checks.push({ name: "all_steps_completed", passed: input.steps.length > 0 && nonCompleted.length === 0, detail: nonCompleted.length ? `${nonCompleted.length} step(s) are not completed` : undefined });
  checks.push({ name: "no_failed_steps", passed: failedSteps.length === 0, detail: failedSteps.length ? failedSteps.map(step => `${step.id}: ${step.error ?? "failed"}`).join(" | ") : undefined });
  checks.push({ name: "verification_evidence_present", passed: verificationResults.length > 0, detail: verificationResults.length ? `${verificationResults.length} verification result(s)` : "No step-level verification result" });
  checks.push({ name: "all_reported_verifications_pass", passed: verificationResults.length > 0 && verificationResults.every(Boolean), detail: verificationResults.some(value => !value) ? "At least one verification result is false" : undefined });
  checks.push({ name: "artifact_provenance_valid", passed: input.artifacts.every(artifact => Boolean(artifact.sha256) && (!artifact.verificationStatus || ["VERIFIED", "EXECUTION_VERIFIED"].includes(artifact.verificationStatus))), detail: "Artifact hash or verification status is missing/invalid" });
  checks.push({ name: "durable_evidence_present", passed: input.evidence.length > 0, detail: "No durable execution evidence" });

  const critic = critiqueExecution({
    goal: input.goal,
    artifacts: input.artifacts,
    evidence: input.evidence,
    verification: { passed: checks.every(check => check.passed), checks },
  });
  return { passed: checks.every(check => check.passed) && critic.decision === "ACCEPT", checks, critic };
}
