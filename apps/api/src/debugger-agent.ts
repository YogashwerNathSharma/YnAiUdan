export type DebugEvidence = { source: "error" | "test" | "log" | "file"; message: string; path?: string; line?: number };
export type DebugDiagnosis = { category: "TYPE_ERROR" | "TEST_FAILURE" | "BUILD_FAILURE" | "RUNTIME_ERROR" | "UNKNOWN"; confidence: number; likelyFiles: string[]; evidence: DebugEvidence[]; summary: string; retryable: boolean };

const patterns: Array<[DebugDiagnosis["category"], RegExp]> = [
  ["TYPE_ERROR", /(TS\d+|TypeScript|type .* is not assignable|Property .* does not exist)/i],
  ["TEST_FAILURE", /(test failed|failing test|assertion.*failed|expected .* received)/i],
  ["BUILD_FAILURE", /(build failed|module not found|cannot resolve module|compile failed)/i],
  ["RUNTIME_ERROR", /(uncaught|exception|stack trace|syntaxerror|referenceerror|typeerror)/i]
];

export function diagnoseFailure(message: string, evidence: DebugEvidence[] = []): DebugDiagnosis {
  const category = patterns.find(([, pattern]) => pattern.test(message))?.[0] ?? "UNKNOWN";
  const files = new Set<string>();
  const locationPattern = /(?:^|\s)([^\s:]+\.(?:ts|tsx|js|jsx|json|css|vue)):(\d+)(?::\d+)?/g;
  for (const match of message.matchAll(locationPattern)) files.add(match[1]);
  for (const item of evidence) if (item.path) files.add(item.path);
  const retryable = category !== "UNKNOWN" || evidence.some(item => item.path);
  return {
    category,
    confidence: category === "UNKNOWN" ? 0.2 : files.size ? 0.9 : 0.7,
    likelyFiles: [...files].slice(0, 20),
    evidence,
    summary: category === "UNKNOWN" ? "The failure could not be classified confidently." : `Failure classified as ${category}.`,
    retryable
  };
}
