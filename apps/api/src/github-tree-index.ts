import type { GitHubClient, GitHubRepository } from "./github-agent.js";
import type { DependencyCandidate } from "./dependency-aware-file-selector.js";
import { selectDependencyAwareFiles } from "./dependency-aware-file-selector.js";

export type RepositoryTreeEntry = { path: string; type?: "file" | "directory"; content?: string; imports?: string[] };
export type RepositoryTreeClient = GitHubClient & { listTree?: (repository: GitHubRepository, ref: string) => Promise<RepositoryTreeEntry[]> };

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html)$/i;
const IMPORT_RE = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+(?:[^'";]+?\s+from\s+)?)(['"])([^'"]+)\1/g;

function importsFromContent(content: string): string[] {
  return [...content.matchAll(IMPORT_RE)]
    .map(match => match[2])
    .filter((value): value is string => typeof value === "string" && value.startsWith("."));
}

export async function indexRepositoryForTask(client: RepositoryTreeClient, repository: GitHubRepository, ref: string, task: string, maxFiles = 30) {
  if (!client.listTree) throw new Error("GitHub client does not support repository tree indexing");
  const tree = await client.listTree(repository, ref);
  const candidates: DependencyCandidate[] = tree
    .filter(entry => entry.type !== "directory" && SOURCE.test(entry.path))
    .map(entry => ({
      path: entry.path,
      content: entry.content ?? "",
      imports: entry.imports?.length ? entry.imports : importsFromContent(entry.content ?? ""),
    }));
  return selectDependencyAwareFiles(task, candidates, maxFiles);
}
