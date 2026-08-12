import { z } from "zod";

export const githubActionSchema = z.enum(["READ_REPOSITORY", "READ_BRANCHES", "READ_FILE", "CREATE_BRANCH", "WRITE_FILE", "COMMIT", "PUSH", "CREATE_PR", "MERGE_PR"]);
export type GitHubAction = z.infer<typeof githubActionSchema>;

const readOnly: GitHubAction[] = ["READ_REPOSITORY", "READ_BRANCHES", "READ_FILE"];
const approvalRequired: GitHubAction[] = ["CREATE_BRANCH", "WRITE_FILE", "COMMIT", "PUSH", "CREATE_PR", "MERGE_PR"];

export function githubActionPolicy(action: GitHubAction, approved = false): { allowed: boolean; requiresApproval: boolean; reason?: string } {
  if (readOnly.includes(action)) return { allowed: true, requiresApproval: false };
  if (approvalRequired.includes(action) && !approved) return { allowed: false, requiresApproval: true, reason: "This GitHub action requires explicit approval" };
  return { allowed: true, requiresApproval: false };
}

export function validateGitRef(ref: string): boolean {
  return ref.length > 0 && ref.length <= 200 && !ref.startsWith("-") && !ref.includes("..") && !ref.includes("//");
}
