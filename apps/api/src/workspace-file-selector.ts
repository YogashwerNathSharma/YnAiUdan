export type FileCandidate = { path: string; content?: string };
export type FileSelection = { paths: string[]; scores: Array<{ path: string; score: number }> };

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is", "are", "fix", "add", "update", "make"]);
const TOKEN = /[A-Za-z0-9_]+/g;

function tokens(value: string): string[] { return (value.toLowerCase().match(TOKEN) ?? []).filter(token => token.length > 1 && !STOP_WORDS.has(token)); }

export function selectRelevantFiles(task: string, candidates: FileCandidate[], maxFiles = 20): FileSelection {
  if (!task.trim()) throw new Error("Task is required");
  const taskTokens = new Set(tokens(task));
  if (!taskTokens.size) return { paths: candidates.slice(0, maxFiles).map(c => c.path), scores: candidates.slice(0, maxFiles).map(c => ({ path: c.path, score: 0 })) };
  const scored = candidates.map(candidate => {
    const pathTokens = tokens(candidate.path.replace(/\.[^.]+$/, "").replace(/[\\/.-]/g, " "));
    const contentTokens = tokens(candidate.content ?? "").slice(0, 5000);
    const pathScore = pathTokens.reduce((sum, token) => sum + (taskTokens.has(token) ? 4 : 0), 0);
    const contentScore = contentTokens.reduce((sum, token) => sum + (taskTokens.has(token) ? 1 : 0), 0);
    return { path: candidate.path, score: pathScore + Math.min(contentScore, 10) };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const selected = scored.filter(item => item.score > 0).slice(0, maxFiles);
  return { paths: selected.length ? selected.map(item => item.path) : scored.slice(0, maxFiles).map(item => item.path), scores: selected.length ? selected : scored.slice(0, maxFiles) };
}
