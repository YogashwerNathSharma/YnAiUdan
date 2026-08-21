import { requiresApproval, validateBranchName } from "./github-write-policy.js";

export type EngineerWritePlan = { owner: string; name: string; base: string; workingBranch: string; message: string; changes: Array<{ path: string; content: string }>; createPullRequest: boolean };

export function createEngineerWritePlan(input: { owner: string; name: string; base: string; taskId: string; message: string; changes: Array<{ path: string; content: string }>; createPullRequest?: boolean }): EngineerWritePlan {
  const branch = `ynaiudan/${input.taskId}`;
  validateBranchName(branch);
  if (branch === input.base || branch === "main" || branch === "master") throw new Error("Engineering agent cannot use a protected base branch as its working branch");
  if (!input.changes.length) throw new Error("No changes to write");
  return { owner: input.owner, name: input.name, base: input.base, workingBranch: branch, message: input.message, changes: input.changes, createPullRequest: input.createPullRequest ?? true };
}

export function approvalRequiredForPlan(plan: EngineerWritePlan): boolean { return requiresApproval("COMMIT", plan.workingBranch) || (plan.createPullRequest && requiresApproval("PUSH", plan.workingBranch)); }
