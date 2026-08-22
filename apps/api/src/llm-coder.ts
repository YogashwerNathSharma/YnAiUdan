import type { GeneratedPatch } from "./code-generation-protocol.js";
import type { SharedWorkspace, WorkspaceChange } from "./workspace-context.js";

export type PatchGenerator = { generate(): Promise<GeneratedPatch[]> };

export async function generateWorkspaceChanges(generator: PatchGenerator, input: { task: string; workspace: SharedWorkspace }): Promise<WorkspaceChange[]> {
  const patches = await generator.generate();
  const known = new Set(input.workspace.files.map(file => file.path));
  return patches
    .filter(patch => patch.path && (patch.operation === "create" || patch.operation === "update" || patch.operation === "delete"))
    .filter(patch => patch.operation === "create" ? !known.has(patch.path) : known.has(patch.path))
    .map(patch => ({ path: patch.path, operation: patch.operation, content: patch.content ?? "" }));
}
