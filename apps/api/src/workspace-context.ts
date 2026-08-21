export type WorkspaceFile = { path: string; content: string };
export type WorkspaceChange = { path: string; content: string; status: "added" | "modified" | "deleted" };

export type SharedWorkspace = {
  tenantId: string;
  userId: string;
  projectId?: string;
  baseRef: string;
  files: WorkspaceFile[];
  changes: WorkspaceChange[];
  metadata: Record<string, unknown>;
};

export function createWorkspaceContext(input: { tenantId: string; userId: string; projectId?: string; baseRef: string; files?: WorkspaceFile[] }): SharedWorkspace {
  if (!input.tenantId || !input.userId || !input.baseRef) throw new Error("Workspace requires tenant, user and base ref");
  return { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, baseRef: input.baseRef, files: input.files ?? [], changes: [], metadata: {} };
}

export function applyWorkspaceChanges(workspace: SharedWorkspace, changes: WorkspaceChange[]): SharedWorkspace {
  const byPath = new Map(workspace.files.map(file => [file.path, file]));
  for (const change of changes) {
    if (change.status === "deleted") byPath.delete(change.path);
    else byPath.set(change.path, { path: change.path, content: change.content });
  }
  const existing = new Map(workspace.changes.map(change => [change.path, change]));
  for (const change of changes) existing.set(change.path, change);
  return { ...workspace, files: [...byPath.values()], changes: [...existing.values()] };
}
