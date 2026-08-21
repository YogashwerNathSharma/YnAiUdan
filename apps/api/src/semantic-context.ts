export type SemanticDocument = { path: string; text: string };
export type SemanticMatch = { path: string; score: number };

const TOKEN = /[A-Za-z0-9_]+/g;
function terms(value: string): Set<string> { return new Set((value.toLowerCase().match(TOKEN) ?? []).filter(token => token.length > 2)); }

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / Math.sqrt(a.size * b.size);
}

export interface SemanticContextProvider { embed?(text: string): Promise<number[]>; }

export async function semanticRank(query: string, documents: SemanticDocument[], provider?: SemanticContextProvider): Promise<SemanticMatch[]> {
  // Deterministic lexical fallback keeps the engine usable before an embedding provider is configured.
  if (!provider?.embed) {
    const q = terms(query);
    return documents.map(doc => ({ path: doc.path, score: similarity(q, terms(`${doc.path} ${doc.text}`)) })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  }
  const q = await provider.embed(query);
  const matches: SemanticMatch[] = [];
  for (const doc of documents) {
    const vector = await provider.embed(doc.text);
    const dot = q.reduce((sum, value, i) => sum + value * (vector[i] ?? 0), 0);
    const qNorm = Math.sqrt(q.reduce((sum, value) => sum + value * value, 0));
    const vNorm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    matches.push({ path: doc.path, score: qNorm && vNorm ? dot / (qNorm * vNorm) : 0 });
  }
  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
