import type { FileCandidate, FileSelection } from "./workspace-file-selector.js";
import { selectRelevantFiles } from "./workspace-file-selector.js";

export type DependencyCandidate = FileCandidate & { imports?: string[] };

function normalize(value: string): string { const parts: string[] = []; for (const part of value.replace(/\\/g, "/").split("/")) { if (!part || part === ".") continue; if (part === "..") parts.pop(); else parts.push(part); } return parts.join("/"); }
function resolveImport(from: string, imported: string): string | null {
  if (!imported.startsWith(".")) return null;
  const parts = normalize(from).split("/"); parts.pop();
  const target = normalize([...parts, imported].join("/"));
  return target.replace(/\.(js|jsx|ts|tsx)$/, "");
}

export function selectDependencyAwareFiles(task: string, candidates: DependencyCandidate[], maxFiles = 30): FileSelection {
  const base = selectRelevantFiles(task, candidates, maxFiles);
  const selected = new Set(base.paths);
  const byNormalized = new Map(candidates.map(candidate => [normalize(candidate.path).replace(/\.(js|jsx|ts|tsx)$/, ""), candidate.path]));
  for (const path of base.paths) {
    const candidate = candidates.find(item => item.path === path);
    for (const imported of candidate?.imports ?? []) {
      const resolved = resolveImport(path, imported);
      const match = resolved ? byNormalized.get(resolved) : undefined;
      if (match && selected.size < maxFiles) selected.add(match);
    }
  }
  const scores = [...selected].map(path => ({ path, score: base.scores.find(item => item.path === path)?.score ?? 0.5 }));
  return { paths: [...selected], scores };
}
