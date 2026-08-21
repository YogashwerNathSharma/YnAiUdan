import { runEngineeringPipeline, type EngineeringPipelineResult } from "./engineering-pipeline.js";
import { executeGitHubEngineering } from "./github-engineer.js";
import type { GitHubClient, GitHubRepository } from "./github-agent.js";
import type { LlmProvider } from "./llm-provider.js";
import type { SharedWorkspace } from "./workspace-context.js";

export type EngineeringGitHubResult = { engineering: EngineeringPipelineResult; github?: unknown };

export async function runEngineeringToGitHub(params: {
  provider: LlmProvider;
  github: GitHubClient;
  workspace: SharedWorkspace;
  repository: GitHubRepository;
  task: string;
  role: string;
  userId: string;
  model?: string;
  commands?: string[];
  maxAttempts?: number;
  approved: boolean;
  title: string;
  commitMessage: string;
  workingBranch: string;
  allowedRepositories: string[];
  repair?: Parameters<typeof runEngineeringPipeline>[0]["repair"];
}): Promise<EngineeringGitHubResult> {
  const engineering = await runEngineeringPipeline({
    provider: params.provider,
    workspace: params.workspace,
    task: params.task,
    role: params.role,
    userId: params.userId,
    model: params.model,
    commands: params.commands,
    maxAttempts: params.maxAttempts,
    repair: params.repair
  });

  if (engineering.status !== "APPROVED" && engineering.status !== "FIXED") return { engineering };

  const changes = engineering.workspace.changes.filter(change => change.status !== "deleted").map(change => ({ path: change.path, content: change.content }));
  if (!changes.length) return { engineering };

  const github = await executeGitHubEngineering({
    client: params.github,
    request: {
      owner: params.repository.owner,
      name: params.repository.name,
      sourceBranch: params.workspace.baseRef,
      workingBranch: params.workingBranch,
      baseBranch: params.repository.defaultBranch ?? params.workspace.baseRef,
      title: params.title,
      message: params.commitMessage,
      approved: params.approved,
      role: params.role,
      tenantId: params.workspace.tenantId,
      allowedRepositories: params.allowedRepositories
    },
    changes,
    waitForCi: true
  });
  return { engineering, github };
}
