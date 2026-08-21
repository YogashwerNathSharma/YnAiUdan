import type { SharedWorkspace, WorkspaceChange } from "./workspace-context.js";

export type CodingPlan = { goal: string; steps: string[]; targetPaths: string[] };
export type WorkspaceCoder = { plan: CodingPlan; changes: WorkspaceChange[] };

const pathPattern = /(?:^|\s)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?:\s|$)/g;

export function createCodingPlan(task: string, workspace: SharedWorkspace): CodingPlan {
  const targetPaths = [...task.matchAll(pathPattern)].map(match => match[1]).filter(path => !path.includes(".."));
  return {
    goal: task.trim(),
    steps: ["Inspect relevant workspace files", "Implement the requested change", "Review the resulting diff", "Run verification before publishing"],
    targetPaths: [...new Set(targetPaths)]
  };
}

export function applyCoderEdits(workspace: SharedWorkspace, edits: Array<{ path: string; content: string }>): WorkspaceCoder {
  const changes: WorkspaceChange[] = edits.map(edit => ({
    path: edit.path,
    content: edit.content,
    status: workspace.files.some(file => file.path === edit.path) ? "modified" : "added"
  }));
  return { plan: createCodingPlan("workspace edit", workspace), changes };
}
