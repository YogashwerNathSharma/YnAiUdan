import type { SharedWorkspace, WorkspaceChange } from "./workspace-context.js";

export type LlmCodingRequest = { task: string; workspace: SharedWorkspace; targetPaths?: string[] };
export type LlmPatch = { path: string; content: string; status?: "added" | "modified" | "deleted" };
export type LlmCoder = { generate: (request: LlmCodingRequest) => Promise<LlmPatch[]> };

export async function generateWorkspaceChanges(coder: LlmCoder, request: LlmCodingRequest): Promise<WorkspaceChange[]> {
  const patches = await coder.generate(request);
  if (!Array.isArray(patches) || patches.length === 0) throw new Error("LLM coder returned no patches");
  const existing = new Set(request.workspace.files.map(file => file.path));
  return patches.map(patch => {
    if (!patch.path || patch.path.startsWith("/") || patch.path.split("/").includes("..")) throw new Error(`Invalid generated path: ${patch.path}`);
    if (patch.content.length > 2_000_000) throw new Error(`Generated file is too large: ${patch.path}`);
    const status = patch.status ?? (existing.has(patch.path) ? "modified" : "added");
    return { path: patch.path, content: patch.content, status };
  });
}
