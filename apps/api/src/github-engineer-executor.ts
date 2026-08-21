import { createEngineerWritePlan, approvalRequiredForPlan, type EngineerWritePlan } from "./github-engineer-gate.js";
import type { GitHubClient } from "./github-agent.js";

export type GitHubEngineerExecution = { status: "WAITING_APPROVAL" | "COMPLETED"; plan: EngineerWritePlan; result?: unknown };

export async function executeGitHubEngineerPlan(client: GitHubClient, input: Parameters<typeof createEngineerWritePlan>[0] & { approved?: boolean }): Promise<GitHubEngineerExecution> {
  const plan = createEngineerWritePlan(input);
  if (approvalRequiredForPlan(plan) && !input.approved) return { status: "WAITING_APPROVAL", plan };
  await client.commitChanges({ owner: plan.owner, name: plan.name }, plan.workingBranch, plan.message, plan.changes);
  if (!plan.createPullRequest) return { status: "COMPLETED", plan };
  const result = await client.createPullRequest({ owner: plan.owner, name: plan.name }, plan.message, plan.workingBranch, plan.base, `Automated engineering change for task ${input.taskId}`);
  return { status: "COMPLETED", plan, result };
}
