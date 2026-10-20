import type { GitHubClient, GitHubRepository, GitHubFileChange } from "./github-agent.js";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

export type GitHubEngineeringRequest = {
  owner: string;
  name: string;
  sourceBranch: string;
  workingBranch: string;
  baseBranch: string;
  title: string;
  message: string;
  approved: boolean;
  role: string;
  tenantId: string;
  allowedRepositories: string[];
};

export async function executeGitHubEngineering(input: {
  client: GitHubClient;
  request: GitHubEngineeringRequest;
  changes: GitHubFileChange[];
  waitForCi?: boolean;
}): Promise<{ status: "WAITING_APPROVAL" | "COMPLETED"; branch: string; commit?: unknown; pullRequest?: unknown; ciStatus?: unknown }> {
  const { client, request, changes } = input;
  const repositoryName = `${request.owner}/${request.name}`.toLowerCase();
  if (!request.allowedRepositories.some(value => value.toLowerCase() === repositoryName)) {
    throw new Error("Repository is not in the allowed repository list");
  }
  if (!["OWNER", "ADMIN", "DEVELOPER"].includes(request.role)) {
    throw new Error("GitHub engineering requires developer permissions");
  }
  if (!changes.length) throw new Error("No verified workspace changes are available to write");
  validateBranchName(request.workingBranch);
  if (request.workingBranch === request.baseBranch || ["main", "master", "production", "prod"].includes(request.workingBranch)) {
    throw new Error("Engineering changes must use a non-protected working branch");
  }
  const repo: GitHubRepository = { owner: request.owner, name: request.name, defaultBranch: request.baseBranch };
  if (!request.approved || requiresApproval("COMMIT", request.workingBranch)) {
    return { status: "WAITING_APPROVAL", branch: request.workingBranch };
  }
  await client.createBranch(repo, request.workingBranch, request.sourceBranch);
  const commit = await client.commitChanges(repo, request.workingBranch, request.message, changes);
  const pullRequest = await client.createPullRequest(repo, request.title, request.workingBranch, request.baseBranch, `YnAiUdan engineering output for tenant ${request.tenantId}. Changes were prepared in a working branch.`);
  let ciStatus: unknown;
  const commitObject = commit && typeof commit === "object" ? commit as Record<string, unknown> : {};
  const sha = typeof commitObject.commitSha === "string" ? commitObject.commitSha : typeof commitObject.sha === "string" ? commitObject.sha : undefined;
  if (input.waitForCi && sha && client.getCommitStatus) ciStatus = await client.getCommitStatus(repo, sha);
  return { status: "COMPLETED", branch: request.workingBranch, commit, pullRequest, ciStatus };
}
