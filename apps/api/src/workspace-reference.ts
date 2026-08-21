export type WorkspaceReference = {
  tenantId: string;
  userId: string;
  projectId?: string;
  repository: { owner: string; name: string };
  baseRef: string;
  commitSha?: string;
  workingBranch?: string;
  snapshotId?: string;
};

export function createWorkspaceReference(input: WorkspaceReference): WorkspaceReference {
  if (!input.tenantId || !input.userId) throw new Error("Workspace reference requires tenant and user");
  if (!input.repository.owner || !input.repository.name) throw new Error("Workspace reference requires repository");
  if (!input.baseRef) throw new Error("Workspace reference requires base ref");
  if (input.commitSha && !/^[0-9a-f]{7,64}$/i.test(input.commitSha)) throw new Error("Invalid commit SHA");
  if (input.workingBranch === "main" || input.workingBranch === "master") throw new Error("Workspace branch must not be a protected default branch");
  return Object.freeze({ ...input, repository: Object.freeze({ ...input.repository }) });
}

export function workspaceReferenceKey(ref: WorkspaceReference): string {
  const revision = ref.commitSha ?? ref.baseRef;
  return `${ref.repository.owner}/${ref.repository.name}@${revision}`;
}
