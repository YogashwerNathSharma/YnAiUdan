import { z } from "zod";
import type { GitHubClient, GitHubRepository, GitHubFileChange } from "./github-agent.js";
import { evaluateGitHubMutation } from "./github-safety-gate.js";

export const githubEngineerRequestSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  sourceBranch: z.string().min(1).max(200),
  workingBranch: z.string().regex(/^[A-Za-z0-9._/-]+$/).max(200),
  baseBranch: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(500),
  approved: z.boolean().default(false),
  role: z.string().min(1),
  tenantId: z.string().min(1),
  allowedRepositories: z.array(z.string()).default([])
});

export type GitHubEngineerResult = { branch: unknown; commit: unknown; pullRequest: unknown; ci?: unknown };

export async function executeGitHubEngineering(params: {
  client: GitHubClient;
  request: z.input<typeof githubEngineerRequestSchema>;
  changes: GitHubFileChange[];
  waitForCi?: boolean;
}): Promise<GitHubEngineerResult> {
  const request = githubEngineerRequestSchema.parse(params.request);
  if (!params.changes.length) throw new Error("No code changes supplied.");
  const repo: GitHubRepository = { owner: request.owner, name: request.name, defaultBranch: request.baseBranch };
  const decision = evaluateGitHubMutation({
    role: request.role,
    tenantId: request.tenantId,
    repository: repo,
    allowedRepositories: request.allowedRepositories,
    sourceBranch: request.sourceBranch,
    workingBranch: request.workingBranch,
    baseBranch: request.baseBranch,
    operation: "BRANCH",
    explicitApproval: request.approved
  });
  if (!decision.allowed) throw new Error(`GitHub safety gate blocked operation: ${decision.reasons.join("; ")}`);
  const branch = await params.client.createBranch(repo, request.workingBranch, request.sourceBranch);
  const commitDecision = evaluateGitHubMutation({ ...request, repository: repo, operation: "COMMIT", explicitApproval: request.approved });
  if (!commitDecision.allowed) throw new Error(`GitHub safety gate blocked commit: ${commitDecision.reasons.join("; ")}`);
  const commit = await params.client.commitChanges(repo, request.workingBranch, request.message, params.changes);
  const commitSha = (commit as { commitSha?: string }).commitSha;
  if (!commitSha) throw new Error("GitHub commit did not return a commit SHA.");
  const prDecision = evaluateGitHubMutation({ ...request, repository: repo, operation: "PR", explicitApproval: request.approved });
  if (!prDecision.allowed) throw new Error(`GitHub safety gate blocked PR: ${prDecision.reasons.join("; ")}`);
  const pullRequest = await params.client.createPullRequest(repo, request.title, request.workingBranch, request.baseBranch, "Created by YnAiUdan after verification and explicit approval.");
  let ci: unknown;
  if (params.waitForCi && params.client.getCommitStatus) ci = await params.client.getCommitStatus(repo, commitSha);
  return { branch, commit, pullRequest, ci };
}
