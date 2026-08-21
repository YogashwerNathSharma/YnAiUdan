import { executeTool } from "./tool-executor.js";
import { analyzeFailure, type FailureAnalysis } from "./failure-analyzer.js";
import { verifyCodeChange, verificationPassed, type VerificationResult } from "./code-verification.js";
import type { AutonomyMode } from "./permissions.js";

export type AutoFixAttempt = { attempt: number; analysis: FailureAnalysis; verification: VerificationResult[] };

export type AutoFixOptions = {
  role: string;
  tenantId: string;
  userId: string;
  projectId?: string;
  mode?: AutonomyMode;
  maxAttempts?: number;
  commands?: string[];
  fix: (analysis: FailureAnalysis, attempt: number) => Promise<{ toolName: string; input: unknown }>;
};

export async function runAutoFixLoop(options: AutoFixOptions): Promise<{ ok: boolean; attempts: AutoFixAttempt[] }> {
  const maxAttempts = Math.min(5, Math.max(1, options.maxAttempts ?? 3));
  const attempts: AutoFixAttempt[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const verification = await verifyCodeChange({ ...options, commands: options.commands });
    if (verificationPassed(verification)) return { ok: true, attempts };
    const failed = verification.find(result => !result.ok) ?? verification[verification.length - 1];
    if (!failed) return { ok: false, attempts };
    const analysis = analyzeFailure(failed.command, failed.stdout, failed.stderr);
    const record: AutoFixAttempt = { attempt, analysis, verification };
    attempts.push(record);
    if (!analysis.retryable || attempt === maxAttempts) return { ok: false, attempts };
    const action = await options.fix(analysis, attempt);
    const result = await executeTool({ toolName: action.toolName, input: action.input, role: options.role, mode: options.mode ?? "CONFIRM_TOOLS", context: { tenantId: options.tenantId, userId: options.userId, projectId: options.projectId } });
    if (!result.ok) return { ok: false, attempts };
  }
  return { ok: false, attempts };
}
