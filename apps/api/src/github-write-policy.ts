import { z } from "zod";

export const githubWriteActionSchema = z.enum(["CREATE_BRANCH", "COMMIT", "PUSH", "CREATE_PR", "MERGE"]);
export type GitHubWriteAction = z.infer<typeof githubWriteActionSchema>;

const protectedBranches = new Set(["main", "master", "production", "prod"]);

export function requiresApproval(action: GitHubWriteAction, branch?: string): boolean {
  if (action === "MERGE" || action === "PUSH" || action === "CREATE_PR" || action === "COMMIT") return true;
  return Boolean(branch && protectedBranches.has(branch));
}

export function validateBranchName(branch: string): void {
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.length > 200 || branch.startsWith("/") || branch.endsWith("/") || branch.includes("..")) {
    throw new Error("Invalid GitHub branch name");
  }
  if (protectedBranches.has(branch)) throw new Error("Protected branch cannot be created or modified by this operation");
}
