import { buildCiDebugContext, type FailedCiJob, type DebugContext } from "./ci-log-debug-context.js";
import { diagnoseFailure, type DebugDiagnosis } from "./debugger-agent.js";

export type CiRepairInput = { runId: number; sha: string; jobs: FailedCiJob[] };
export type CiRepairDecision = { action: "NO_ACTION" | "DEBUG" | "NEEDS_REVIEW"; context: DebugContext; diagnosis?: DebugDiagnosis };

export function createCiRepairDecision(input: CiRepairInput): CiRepairDecision {
  const context = buildCiDebugContext(input.runId, input.sha, input.jobs);
  const failed = input.jobs.filter(job => job.conclusion === "failure");
  if (!failed.length) return { action: "NO_ACTION", context };
  const diagnosis = diagnoseFailure(context.prompt);
  return { action: diagnosis.retryable ? "DEBUG" : "NEEDS_REVIEW", context, diagnosis };
}
