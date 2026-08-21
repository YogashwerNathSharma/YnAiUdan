export type ImportGraphNode = { path: string; imports: string[]; dependents: string[] };

const IMPORT_RE = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+(?:[^'";]+?\s+from\s+)?|require\s*\()(['"])([^'"]+)\1/g;
function normalize(path: string): string { return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.(?:ts|tsx|js|jsx|mjs|cjs)$/, ""); }
function resolveLocal(from: string, specifier: string, files: Set<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = from.split("/"); base.pop();
  const target = normalize([...base, specifier].join("/"));
  for (const candidate of files) if (normalize(candidate) === target || normalize(candidate).startsWith(`${target}/`)) return candidate;
  return null;
}

export function buildImportGraph(files: Array<{ path: string; content: string }>): ImportGraphNode[] {
  const fileSet = new Set(files.map(file => file.path));
  const nodes = new Map(files.map(file => [file.path, { path: file.path, imports: [], dependents: [] } as ImportGraphNode]));
  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(file.content)) !== null) {
      const resolved = resolveLocal(file.path, match[2], fileSet);
      if (resolved && resolved !== file.path && !nodes.get(file.path)!.imports.includes(resolved)) nodes.get(file.path)!.imports.push(resolved);
    }
    IMPORT_RE.lastIndex = 0;
  }
  for (const node of nodes.values()) for (const imported of node.imports) nodes.get(imported)?.dependents.push(node.path);
  return [...nodes.values()];
}

export function expandImportContext(graph: ImportGraphNode[], seeds: string[], maxFiles = 30): string[] {
  const byPath = new Map(graph.map(node => [node.path, node]));
  const selected = new Set(seeds);
  const queue = [...seeds];
  while (queue.length && selected.size < maxFiles) {
    const current = queue.shift()!;
    const node = byPath.get(current);
    for (const related of [...(node?.imports ?? []), ...(node?.dependents ?? [])]) {
      if (!selected.has(related) && selected.size < maxFiles) { selected.add(related); queue.push(related); }
    }
  }
  return [...selected];
}
