import type { GitHubRepository } from "./github-agent.js";
import { indexRepositoryForTask, type RepositoryTreeClient } from "./github-tree-index.js";
import { buildImportGraph, expandImportContext } from "./import-graph.js";
import { resolveWorkspace, type WorkspaceFileLoader, type WorkspaceReference } from "./workspace-resolver.js";

export type ContextPackage = {
  reference: WorkspaceReference;
  selectedPaths: string[];
  files: Array<{ path: string; content: string }>;
  graph: ReturnType<typeof buildImportGraph>;
};

export async function buildContextPackage(params: {
  client: RepositoryTreeClient;
  repository: GitHubRepository;
  ref: string;
  task: string;
  tenantId: string;
  userId: string;
  projectId?: string;
  maxFiles?: number;
  loader?: WorkspaceFileLoader;
}): Promise<ContextPackage> {
  const maxFiles = Math.min(50, Math.max(1, params.maxFiles ?? 30));
  const selected = await indexRepositoryForTask(params.client, params.repository, params.ref, params.task, maxFiles);
  const tree = params.client.listTree ? await params.client.listTree(params.repository, params.ref) : [];
  const sourceFiles = tree.filter(entry => entry.type !== "directory" && entry.content != null).map(entry => ({ path: entry.path, content: entry.content ?? "" }));
  const graph = buildImportGraph(sourceFiles);
  const expandedPaths = expandImportContext(graph, selected.paths, maxFiles);
  const loader = params.loader ?? { getFile: (repository: GitHubRepository, path: string, ref: string) => params.client.getFile(repository, path, ref) };
  const workspace = await resolveWorkspace({ tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, repository: params.repository, commitSha: params.ref }, expandedPaths, loader);
  return { reference: { tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, repository: params.repository, commitSha: params.ref }, selectedPaths: expandedPaths, files: workspace.files, graph };
}
