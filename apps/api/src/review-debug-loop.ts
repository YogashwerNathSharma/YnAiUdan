import { diagnoseFailure, type DebugDiagnosis } from "./debugger-agent.js";
import { reviewWorkspace } from "./workspace-reviewer.js";
import { applyWorkspaceChanges, type SharedWorkspace, type WorkspaceChange } from "./workspace-context.js";

export type ReviewDebugResult = { status: "APPROVED" | "FIXED" | "NEEDS_REVIEW" | "FAILED"; attempts: number; review: ReturnType<typeof reviewWorkspace>; diagnoses: DebugDiagnosis[]; workspace: SharedWorkspace };

export async function reviewAndRepairWorkspace(params: {
  workspace: SharedWorkspace;
  maxAttempts?: number;
  packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> };
  repair: (diagnosis: DebugDiagnosis, review: ReturnType<typeof reviewWorkspace>, attempt: number) => Promise<WorkspaceChange[] | null>;
}): Promise<ReviewDebugResult> {
  const maxAttempts = Math.min(3, Math.max(1, params.maxAttempts ?? 2));
  let workspace = params.workspace;
  const diagnoses: DebugDiagnosis[] = [];
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const review = reviewWorkspace(workspace, params.packageJson);
    if (review.approved) return { status: attempt === 0 ? "APPROVED" : "FIXED", attempts: attempt, review, diagnoses, workspace };
    if (attempt === maxAttempts) return { status: "FAILED", attempts: attempt, review, diagnoses, workspace };
    const message = JSON.stringify(review);
    const diagnosis = diagnoseFailure(message);
    diagnoses.push(diagnosis);
    if (!diagnosis.retryable) return { status: "NEEDS_REVIEW", attempts: attempt, review, diagnoses, workspace };
    const changes = await params.repair(diagnosis, review, attempt + 1);
    if (!changes?.length) return { status: "FAILED", attempts: attempt + 1, review, diagnoses, workspace };
    workspace = applyWorkspaceChanges(workspace, changes);
  }
  throw new Error("Unreachable review/repair state");
}
