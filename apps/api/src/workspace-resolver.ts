import type { GitHubClient, GitHubRepository } from "./github-agent.js";
import type { SharedWorkspace, WorkspaceFile } from "./workspace-context.js";

export type WorkspaceReference = {
  tenantId: string;
  userId: string;
  projectId?: string;
  repository: GitHubRepository;
  commitSha: string;
  workingBranch?: string;
};

export type WorkspaceFileLoader = {
  getFile(repository: GitHubRepository, path: string, ref: string): Promise<unknown>;
};

function extractContent(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "content" in result && typeof (result as { content?: unknown }).content === "string") return (result as { content: string }).content;
  throw new Error("GitHub file response does not contain text content");
}

function validatePath(path: string): void {
  if (!path || path.startsWith("/") || path.split(/[\\/]/).includes("..")) throw new Error(`Invalid workspace file path: ${path}`);
}

export async function resolveWorkspace(reference: WorkspaceReference, files: string[], loader: WorkspaceFileLoader): Promise<SharedWorkspace> {
  if (!reference.tenantId || !reference.userId) throw new Error("Workspace reference requires tenant and user");
  if (!/^[0-9a-f]{7,64}$/i.test(reference.commitSha)) throw new Error("Workspace reference requires a valid commit SHA");
  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.length > 100) throw new Error("Workspace file selection is too large");
  const workspaceFiles: WorkspaceFile[] = [];
  for (const path of uniqueFiles) {
    validatePath(path);
    const content = extractContent(await loader.getFile(reference.repository, path, reference.commitSha));
    if (content.length > 2_000_000) throw new Error(`Workspace file is too large: ${path}`);
    workspaceFiles.push({ path, content });
  }
  return {
    tenantId: reference.tenantId,
    userId: reference.userId,
    projectId: reference.projectId,
    baseRef: reference.commitSha,
    files: workspaceFiles,
    changes: [],
    metadata: { repository: reference.repository, commitSha: reference.commitSha, workingBranch: reference.workingBranch, resolvedFileCount: workspaceFiles.length }
  };
}

export function createGitHubWorkspaceResolver(client: GitHubClient): WorkspaceFileLoader {
  return { getFile: (repository, path, ref) => client.getFile(repository, path, ref) };
}
