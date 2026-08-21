import type { GitHubRepository } from "./github-agent.js";

export type GitHubSafetyDecision = { allowed: boolean; reasons: string[] };
const protectedBranches = new Set(["main", "master", "production", "prod"]);
const roles = new Set(["OWNER", "ADMIN", "DEVELOPER"]);

export function evaluateGitHubMutation(input: {
  role: string;
  tenantId: string;
  repository: GitHubRepository;
  allowedRepositories: string[];
  sourceBranch: string;
  workingBranch: string;
  baseBranch: string;
  operation: "BRANCH" | "COMMIT" | "PUSH" | "PR";
  explicitApproval: boolean;
}): GitHubSafetyDecision {
  const reasons: string[] = [];
  const key = `${input.repository.owner}/${input.repository.name}`.toLowerCase();
  const allowed = input.allowedRepositories.map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!input.tenantId) reasons.push("Missing tenant context.");
  if (!roles.has(input.role)) reasons.push("Role is not allowed to mutate GitHub.");
  if (!allowed.includes(key)) reasons.push("Repository is not allowlisted.");
  if (!input.explicitApproval) reasons.push("Explicit approval is required.");
  if (input.workingBranch.toLowerCase() === input.baseBranch.toLowerCase()) reasons.push("Working branch cannot equal base branch.");
  if (input.workingBranch.toLowerCase() === input.sourceBranch.toLowerCase()) reasons.push("Working branch cannot equal source branch.");
  if (input.operation !== "PR" && protectedBranches.has(input.workingBranch.toLowerCase())) reasons.push("Protected branch cannot be directly mutated.");
  if (input.operation === "PUSH" && input.role !== "OWNER") reasons.push("Direct push requires OWNER role.");
  return { allowed: reasons.length === 0, reasons };
}
