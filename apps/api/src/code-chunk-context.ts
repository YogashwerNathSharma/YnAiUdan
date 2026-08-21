export type CodeChunk = { path: string; startLine: number; endLine: number; text: string; kind: "function" | "class" | "method" | "block" };

const DECLARATION = /^(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/;

export function chunkSourceFile(path: string, content: string, maxLines = 80): CodeChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: CodeChunk[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!DECLARATION.test(lines[i].trim())) continue;
    let depth = 0;
    let opened = false;
    let end = i;
    for (let j = i; j < Math.min(lines.length, i + maxLines); j++) {
      for (const char of lines[j]) {
        if (char === "{") { depth++; opened = true; }
        if (char === "}") depth--;
      }
      end = j;
      if (opened && depth <= 0) break;
    }
    const nameMatch = lines[i].trim().match(DECLARATION);
    const name = nameMatch?.[1] ?? nameMatch?.[2] ?? "block";
    chunks.push({ path, startLine: i + 1, endLine: end + 1, text: `${name}\n${lines.slice(i, end + 1).join("\n")}`, kind: /^class\b/.test(lines[i].trim()) ? "class" : "function" });
  }
  return chunks;
}

export function selectRelevantChunks(task: string, chunks: CodeChunk[], maxChunks = 20): CodeChunk[] {
  const terms = new Set((task.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter(token => token.length > 2));
  return chunks.map(chunk => ({ chunk, score: [...terms].reduce((sum, term) => sum + (chunk.text.toLowerCase().includes(term) || chunk.path.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score || a.chunk.path.localeCompare(b.chunk.path) || a.chunk.startLine - b.chunk.startLine).slice(0, maxChunks).map(item => item.chunk);
}
