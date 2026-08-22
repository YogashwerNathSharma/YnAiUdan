export type WorkspaceFile = {
  path: string;
  content: string;
};

export type WorkspaceChange = {
  path: string;
  operation: "create" | "update" | "delete";
  content?: string;
  status?: "added" | "modified" | "deleted";
};

export type SharedWorkspace = {
  tenantId: string;
  userId: string;
  projectId?: string;
  baseRef: string;
  files: WorkspaceFile[];
  changes: WorkspaceChange[];
  metadata?: Record<string, unknown>;
};

export function createWorkspaceContext(input: {
  tenantId: string;
  userId: string;
  projectId?: string;
  baseRef: string;
  files?: WorkspaceFile[];
  metadata?: Record<string, unknown>;
}): SharedWorkspace {
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId,
    baseRef: input.baseRef,
    files: (input.files ?? []).map(file => ({ ...file })),
    changes: [],
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };
}

export function applyWorkspaceChanges(workspace: SharedWorkspace, changes: WorkspaceChange[]): SharedWorkspace {
  const files = workspace.files.map(file => ({ ...file }));
  const applied: WorkspaceChange[] = [];
  for (const change of changes) {
    const index = files.findIndex(file => file.path === change.path);
    if (change.operation === "create") {
      if (index >= 0) continue;
      files.push({ path: change.path, content: change.content ?? "" });
      applied.push({ ...change, status: "added" });
      continue;
    }
    if (change.operation === "update") {
      if (index < 0) continue;
      files[index] = { path: change.path, content: change.content ?? "" };
      applied.push({ ...change, status: "modified" });
      continue;
    }
    if (index >= 0) {
      files.splice(index, 1);
      applied.push({ ...change, status: "deleted" });
    }
  }
  return { ...workspace, files, changes: [...workspace.changes, ...applied] };
}
