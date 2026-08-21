import { runEngineeringToGitHub } from "./engineering-github-pipeline.js";
import type { GitHubClient, GitHubRepository } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace } from "./workspace-context.js";

export type EngineeringCommand = {
  task: string;
  tenantId: string;
  userId: string;
  role: string;
  workspace: SharedWorkspace;
  repository: GitHubRepository;
  workingBranch: string;
  allowedRepositories: string[];
  approved: boolean;
  title: string;
  commitMessage: string;
  model?: string;
  commands?: string[];
  maxAttempts?: number;
};

export async function executeEngineeringCommand(input: EngineeringCommand, deps: { provider: LlmProvider; github: GitHubClient }) {
  if (input.workspace.tenantId !== input.tenantId) throw new Error("Tenant mismatch between command and workspace");
  if (input.workspace.userId !== input.userId) throw new Error("User mismatch between command and workspace");
  return runEngineeringToGitHub({
    provider: deps.provider,
    github: deps.github,
    workspace: input.workspace,
    repository: input.repository,
    task: input.task,
    role: input.role,
    userId: input.userId,
    model: input.model,
    commands: input.commands,
    maxAttempts: input.maxAttempts,
    approved: input.approved,
    title: input.title,
    commitMessage: input.commitMessage,
    workingBranch: input.workingBranch,
    allowedRepositories: input.allowedRepositories
  });
}
