export type EvaluationStatus = "PASS" | "FAIL";

export type AgentEvaluationInput = {
  goal: string;
  completed: boolean;
  verified: boolean;
  recoveryCount?: number;
  repeatedFailure?: boolean;
  toolErrors?: number;
  evidenceCount?: number;
};

export type AgentEvaluation = {
  status: EvaluationStatus;
  score: number;
  dimensions: {
    completion: number;
    verification: number;
    reliability: number;
    efficiency: number;
    evidence: number;
  };
  reasons: string[];
};

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

/**
 * Deterministic post-run evaluation. This is intentionally model-independent:
 * an agent cannot declare itself successful; the evaluator scores observable evidence.
 */
export function evaluateAgentRun(input: AgentEvaluationInput): AgentEvaluation {
  const recoveryCount = Math.max(0, input.recoveryCount ?? 0);
  const toolErrors = Math.max(0, input.toolErrors ?? 0);
  const evidenceCount = Math.max(0, input.evidenceCount ?? 0);
  const completion = input.completed ? 1 : 0;
  const verification = input.verified ? 1 : 0;
  const reliability = clamp(1 - (input.repeatedFailure ? 0.75 : 0) - Math.min(0.5, toolErrors * 0.05));
  const efficiency = clamp(1 - Math.min(0.6, recoveryCount * 0.15) - Math.min(0.4, toolErrors * 0.04));
  const evidence = clamp(evidenceCount / 2);
  const score = Math.round((completion * 0.30 + verification * 0.30 + reliability * 0.18 + efficiency * 0.10 + evidence * 0.12) * 1000) / 1000;
  const reasons: string[] = [];
  if (!input.completed) reasons.push("OBJECTIVE_NOT_COMPLETED");
  if (!input.verified) reasons.push("OBJECTIVE_NOT_VERIFIED");
  if (input.repeatedFailure) reasons.push("REPEATED_FAILURE_DETECTED");
  if (toolErrors > 0) reasons.push(`TOOL_ERRORS:${toolErrors}`);
  if (recoveryCount > 0) reasons.push(`RECOVERIES:${recoveryCount}`);
  if (evidenceCount < 2) reasons.push("INSUFFICIENT_EVIDENCE");
  if (reasons.length === 0) reasons.push("RUN_PASSED_ALL_EVALUATION_GATES");
  return { status: score >= 0.75 && input.completed && input.verified && !input.repeatedFailure ? "PASS" : "FAIL", score, dimensions: { completion, verification, reliability, efficiency, evidence }, reasons };
}
