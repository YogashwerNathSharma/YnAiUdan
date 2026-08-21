import type { GitHubClient, GitHubRepository } from "./github-agent.js";
import type { FileCandidate } from "./workspace-file-selector.js";
import { selectDependencyAwareFiles } from "./dependency-aware-file-selector.js";

export type RepositoryTreeEntry = { path: string; type?: "file" | "directory"; content?: string; imports?: string[] };
export type RepositoryTreeClient = GitHubClient & { listTree?: (repository: GitHubRepository, ref: string) => Promise<RepositoryTreeEntry[]> };

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html)$/i;

export async function indexRepositoryForTask(client: RepositoryTreeClient, repository: GitHubRepository, ref: string, task: string, maxFiles = 30) {
  if (!client.listTree) throw new Error("GitHub client does not support repository tree indexing");
  const tree = await client.listTree(repository, ref);
  const candidates: FileCandidate[] = tree.filter(entry => entry.type !== "directory" && SOURCE.test(entry.path)).map(entry => ({ path: entry.path, content: entry.content ?? "" }));
  return selectDependencyAwareFiles(task, candidates, maxFiles);
}
