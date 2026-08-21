import { semanticRank, type SemanticContextProvider } from "./semantic-context.js";
import { selectRelevantFiles, type FileCandidate } from "./workspace-file-selector.js";
import { buildImportGraph } from "./import-graph.js";

export type HybridContextMatch = { path: string; score: number; lexical: number; semantic: number; dependency: number; test: number };

export async function rankHybridContext(task: string, candidates: FileCandidate[], provider?: SemanticContextProvider, maxFiles = 30): Promise<HybridContextMatch[]> {
  const lexical = selectRelevantFiles(task, candidates, candidates.length).scores;
  const semantic = await semanticRank(task, candidates.map(file => ({ path: file.path, text: file.content ?? "" })), provider);
  const graph = buildImportGraph(candidates.map(file => ({ path: file.path, content: file.content ?? "" })));
  const byPath = new Map(graph.map(node => [node.path, node]));
  const lexicalMap = new Map(lexical.map(item => [item.path, item.score]));
  const semanticMap = new Map(semantic.map(item => [item.path, item.score]));
  const maxLexical = Math.max(1, ...lexical.map(item => item.score));
  const matches = candidates.map(candidate => {
    const lex = (lexicalMap.get(candidate.path) ?? 0) / maxLexical;
    const sem = Math.max(0, semanticMap.get(candidate.path) ?? 0);
    const node = byPath.get(candidate.path);
    const dependency = Math.min(1, ((node?.imports.length ?? 0) + (node?.dependents.length ?? 0)) / 6);
    const test = /(^|[./_-])(test|spec)([./_-]|$)/i.test(candidate.path) ? 1 : 0;
    const score = lex * 0.45 + sem * 0.35 + dependency * 0.10 + test * 0.10;
    return { path: candidate.path, score, lexical: lex, semantic: sem, dependency, test };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return matches.slice(0, Math.min(50, Math.max(1, maxFiles)));
}
