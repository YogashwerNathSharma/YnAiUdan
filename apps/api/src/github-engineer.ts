import { z } from "zod";
import type { GitHubClient, GitHubRepository, GitHubFileChange } from "./github-agent.js";

export const githubEngineerRequestSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  sourceBranch: z.string().min(1).max(200),
  workingBranch: z.string().regex(/^[A-Za-z0-9._/-]+$/).max(200),
  baseBranch: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(500),
  approved: z.boolean().default(false)
});

export type GitHubEngineerResult = { branch: unknown; commit: unknown; pullRequest: unknown };

export async function executeGitHubEngineering(params: {
  client: GitHubClient;
  request: z.input<typeof githubEngineerRequestSchema>;
  changes: GitHubFileChange[];
}): Promise<GitHubEngineerResult> {
  const request = githubEngineerRequestSchema.parse(params.request);
  if (!request.approved) throw new Error("Explicit approval is required before GitHub mutation.");
  if (request.workingBranch === request.baseBranch) throw new Error("Working branch must differ from base branch.");
  if (!params.changes.length) throw new Error("No code changes supplied.");

  const repo: GitHubRepository = { owner: request.owner, name: request.name, defaultBranch: request.baseBranch };
  const branch = await params.client.createBranch(repo, request.workingBranch, request.sourceBranch);
  const commit = await params.client.commitChanges(repo, request.workingBranch, request.message, params.changes);
  const commitSha = (commit as { commitSha?: string }).commitSha;
  if (!commitSha) throw new Error("GitHub commit did not return a commit SHA.");
  const pullRequest = await params.client.createPullRequest(repo, request.title, request.workingBranch, request.baseBranch, "Created by YnAiUdan after verification and explicit approval.");
  return { branch, commit, pullRequest };
}
