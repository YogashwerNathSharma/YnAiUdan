import { diagnoseFailure, type DebugDiagnosis } from "./debugger-agent.js";
import { reviewWorkspace } from "./workspace-reviewer.js";
import { applyWorkspaceChanges, type SharedWorkspace, type WorkspaceChange } from "./workspace-context.js";
import { verifyCodeChange, verificationPassed, type VerificationResult } from "./code-verification.js";

export type ReviewVerifyRepairResult = { status: "APPROVED" | "FIXED" | "NEEDS_REVIEW" | "FAILED"; attempts: number; review: ReturnType<typeof reviewWorkspace>; verification: VerificationResult[]; diagnoses: DebugDiagnosis[]; workspace: SharedWorkspace };

export async function reviewVerifyRepairWorkspace(params: {
  workspace: SharedWorkspace;
  role: string;
  userId: string;
  projectId?: string;
  mode?: Parameters<typeof verifyCodeChange>[0]["mode"];
  commands?: string[];
  packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> };
  maxAttempts?: number;
  repair: (diagnosis: DebugDiagnosis, review: ReturnType<typeof reviewWorkspace>, verification: VerificationResult[], attempt: number, workspace: SharedWorkspace) => Promise<WorkspaceChange[] | null>;
}): Promise<ReviewVerifyRepairResult> {
  const maxAttempts = Math.min(3, Math.max(1, params.maxAttempts ?? 2));
  let workspace = params.workspace;
  const diagnoses: DebugDiagnosis[] = [];
  let verification: VerificationResult[] = [];

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const review = reviewWorkspace(workspace, params.packageJson);
    verification = await verifyCodeChange({ role: params.role, mode: params.mode, tenantId: workspace.tenantId, userId: params.userId, projectId: params.projectId, commands: params.commands });
    if (review.approved && verificationPassed(verification)) return { status: attempt === 0 ? "APPROVED" : "FIXED", attempts: attempt, review, verification, diagnoses, workspace };
    if (attempt === maxAttempts) return { status: "FAILED", attempts: attempt, review, verification, diagnoses, workspace };
    const diagnosis = diagnoseFailure(JSON.stringify({ review, verification }));
    diagnoses.push(diagnosis);
    if (!diagnosis.retryable) return { status: "NEEDS_REVIEW", attempts: attempt, review, verification, diagnoses, workspace };
    const changes = await params.repair(diagnosis, review, verification, attempt + 1, workspace);
    if (!changes?.length) return { status: "FAILED", attempts: attempt + 1, review, verification, diagnoses, workspace };
    workspace = applyWorkspaceChanges(workspace, changes);
  }
  throw new Error("Unreachable review/verify/repair state");
}
