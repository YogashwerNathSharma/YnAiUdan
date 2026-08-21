import { diagnoseFailure, type DebugEvidence, type DebugDiagnosis } from "./debugger-agent.js";

export type DebugAttempt = { attempt: number; diagnosis: DebugDiagnosis; fixed: boolean };
export type DebugLoopResult = { status: "FIXED" | "FAILED" | "NEEDS_REVIEW"; attempts: DebugAttempt[] };

export async function runDebugLoop(params: {
  failure: string;
  evidence?: DebugEvidence[];
  maxAttempts?: number;
  fix: (diagnosis: DebugDiagnosis, attempt: number) => Promise<boolean>;
  verify: () => Promise<{ ok: boolean; message?: string }>;
}): Promise<DebugLoopResult> {
  const maxAttempts = Math.min(5, Math.max(1, params.maxAttempts ?? 3));
  const attempts: DebugAttempt[] = [];
  let failure = params.failure;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const diagnosis = diagnoseFailure(failure, params.evidence);
    if (!diagnosis.retryable) return { status: "NEEDS_REVIEW", attempts };
    const fixed = await params.fix(diagnosis, attempt);
    attempts.push({ attempt, diagnosis, fixed });
    if (!fixed) return { status: "FAILED", attempts };
    const verification = await params.verify();
    if (verification.ok) return { status: "FIXED", attempts };
    failure = verification.message ?? failure;
  }

  return { status: "FAILED", attempts };
}
