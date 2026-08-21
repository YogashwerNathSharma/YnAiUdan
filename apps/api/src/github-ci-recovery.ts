import type { GitHubClient, GitHubRepository, GitHubFileChange } from "./github-agent.js";
import { diagnoseFailure, type DebugDiagnosis } from "./debugger-agent.js";

export type GitHubCiRecoveryResult = { status: "FIXED" | "FAILED" | "NEEDS_REVIEW"; attempts: number; diagnoses: DebugDiagnosis[]; finalStatus?: unknown };

export async function recoverFromCiFailure(params: {
  client: GitHubClient;
  repo: GitHubRepository;
  branch: string;
  commitMessage: string;
  ciStatus: unknown;
  maxAttempts?: number;
  fix: (diagnosis: DebugDiagnosis, attempt: number) => Promise<GitHubFileChange[] | null>;
}): Promise<GitHubCiRecoveryResult> {
  const maxAttempts = Math.min(3, Math.max(1, params.maxAttempts ?? 2));
  const diagnoses: DebugDiagnosis[] = [];
  let status: any = params.ciStatus;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const message = typeof status === "string" ? status : JSON.stringify(status);
    const diagnosis = diagnoseFailure(message);
    diagnoses.push(diagnosis);
    if (!diagnosis.retryable) return { status: "NEEDS_REVIEW", attempts: attempt - 1, diagnoses, finalStatus: status };
    const changes = await params.fix(diagnosis, attempt);
    if (!changes?.length) return { status: "FAILED", attempts: attempt, diagnoses, finalStatus: status };
    await params.client.commitChanges(params.repo, params.branch, params.commitMessage, changes);
    const ref = await params.client.getFile(params.repo, ".git/HEAD", params.branch).catch(() => null);
    void ref;
    if (!params.client.getCommitStatus) return { status: "NEEDS_REVIEW", attempts: attempt, diagnoses, finalStatus: status };
    const latest = await params.client.getCommitStatus(params.repo, "HEAD");
    status = latest;
    const state = (latest as { state?: string })?.state;
    if (state === "success") return { status: "FIXED", attempts: attempt, diagnoses, finalStatus: latest };
  }
  return { status: "FAILED", attempts: maxAttempts, diagnoses, finalStatus: status };
}
