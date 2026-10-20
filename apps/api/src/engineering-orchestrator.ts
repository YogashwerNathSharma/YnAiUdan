import { runEngineeringPipeline, type EngineeringPipelineResult } from "./engineering-pipeline.js";
import { executeGitHubEngineering } from "./github-engineer.js";
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
  projectId?: string;
  model?: string;
  commands?: string[];
  maxAttempts?: number;
};

export type EngineeringCommandResult = {
  engineering: EngineeringPipelineResult;
  github?: Awaited<ReturnType<typeof executeGitHubEngineering>>;
};

export async function executeEngineeringCommand(
  command: EngineeringCommand,
  deps: { provider: LlmProvider; github: GitHubClient },
): Promise<EngineeringCommandResult> {
  if (command.tenantId !== command.workspace.tenantId) {
    throw new Error("Tenant mismatch between command and workspace");
  }
  if (command.userId !== command.workspace.userId) {
    throw new Error("User mismatch between command and workspace");
  }
  const repositoryName = `${command.repository.owner}/${command.repository.name}`.toLowerCase();
  if (!command.allowedRepositories.some(value => value.toLowerCase() === repositoryName)) {
    throw new Error("Repository is not in the allowed repository list");
  }

  const engineering = await runEngineeringPipeline({
    provider: deps.provider,
    workspace: command.workspace,
    task: command.task,
    role: command.role,
    userId: command.userId,
    projectId: command.projectId ?? command.workspace.projectId,
    model: command.model,
    commands: command.commands,
    maxAttempts: command.maxAttempts,
  });

  if (engineering.status !== "APPROVED" && engineering.status !== "FIXED") return { engineering };
  const changes = engineering.workspace.changes
    .filter(change => change.status !== "deleted" && change.operation !== "delete")
    .map(change => ({ path: change.path, content: change.content ?? "" }));
  if (!changes.length) return { engineering };

  const github = await executeGitHubEngineering({
    client: deps.github,
    request: {
      owner: command.repository.owner,
      name: command.repository.name,
      sourceBranch: command.workspace.baseRef,
      workingBranch: command.workingBranch,
      baseBranch: command.repository.defaultBranch ?? command.workspace.baseRef,
      title: command.title,
      message: command.commitMessage,
      approved: command.approved,
      role: command.role,
      tenantId: command.tenantId,
      allowedRepositories: command.allowedRepositories,
    },
    changes,
    waitForCi: true,
  });
  return { engineering, github };
}
