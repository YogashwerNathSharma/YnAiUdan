import type { SharedWorkspace } from "./workspace-context.js";

export type WorkspaceReview = {
  approved: boolean;
  findings: string[];
};

export function reviewWorkspace(workspace: SharedWorkspace, packageJson?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }): WorkspaceReview {
  const findings: string[] = [];
  const seen = new Set<string>();
  for (const file of workspace.files) {
    if (seen.has(file.path)) findings.push(`Duplicate workspace file: ${file.path}`);
    seen.add(file.path);
    if (file.path.includes("..")) findings.push(`Unsafe workspace path: ${file.path}`);
  }
  for (const change of workspace.changes) {
    if (!change.path || change.path.includes("..")) findings.push(`Unsafe change path: ${change.path}`);
    if (change.operation !== "delete" && change.content == null) findings.push(`Missing content for ${change.path}`);
  }
  return { approved: findings.length === 0, findings };
}
