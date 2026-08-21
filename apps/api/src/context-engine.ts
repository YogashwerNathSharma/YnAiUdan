import type { GitHubRepository } from "./github-agent.js";
import { type RepositoryTreeClient } from "./github-tree-index.js";
import { buildImportGraph } from "./import-graph.js";
import { resolveWorkspace, type WorkspaceFileLoader, type WorkspaceReference } from "./workspace-resolver.js";
import { rankHybridContext } from "./hybrid-context-ranking.js";
import type { SemanticContextProvider } from "./semantic-context.js";

export type ContextPackage = {
  reference: WorkspaceReference;
  selectedPaths: string[];
  files: Array<{ path: string; content: string }>;
  graph: ReturnType<typeof buildImportGraph>;
  ranking: Awaited<ReturnType<typeof rankHybridContext>>;
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
  semanticProvider?: SemanticContextProvider;
}): Promise<ContextPackage> {
  const maxFiles = Math.min(50, Math.max(1, params.maxFiles ?? 30));
  if (!params.task.trim()) throw new Error("Task is required");
  const tree = params.client.listTree ? await params.client.listTree(params.repository, params.ref) : [];
  const sourceFiles = tree.filter(entry => entry.type !== "directory" && entry.content != null).map(entry => ({ path: entry.path, content: entry.content ?? "" }));
  const ranking = await rankHybridContext(params.task, sourceFiles, params.semanticProvider, Math.min(sourceFiles.length || 1, maxFiles));
  const selectedPaths = ranking.map(item => item.path);
  const graph = buildImportGraph(sourceFiles);
  const loader = params.loader ?? { getFile: (repository: GitHubRepository, path: string, ref: string) => params.client.getFile(repository, path, ref) };
  const workspace = await resolveWorkspace({ tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, repository: params.repository, commitSha: params.ref }, selectedPaths, loader);
  return { reference: { tenantId: params.tenantId, userId: params.userId, projectId: params.projectId, repository: params.repository, commitSha: params.ref }, selectedPaths, files: workspace.files, graph, ranking };
}
