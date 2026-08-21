export type FailureAnalysis = {
  category: "TYPECHECK" | "TEST" | "BUILD" | "LINT" | "COMMAND" | "UNKNOWN";
  summary: string;
  likelyFiles: string[];
  retryable: boolean;
};

export function analyzeFailure(command: string, stdout = "", stderr = ""): FailureAnalysis {
  const text = `${command}\n${stdout}\n${stderr}`.slice(-20_000);
  const lower = text.toLowerCase();
  const files = [...text.matchAll(/(?:^|\s)([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|css|scss))(?::\d+(?::\d+)?)?/g)].map(match => match[1]).filter(Boolean).slice(0, 20);
  let category: FailureAnalysis["category"] = "UNKNOWN";
  if (/typecheck|tsc|typescript|ts\d{4}/i.test(text)) category = "TYPECHECK";
  else if (/test|assert|expect|vitest|node:test/i.test(text)) category = "TEST";
  else if (/build|vite build|webpack|rollup/i.test(text)) category = "BUILD";
  else if (/lint|eslint/i.test(text)) category = "LINT";
  else if (command.trim()) category = "COMMAND";
  const summaryLine = (stderr || stdout).split(/\r?\n/).map(line => line.trim()).filter(Boolean).pop() ?? "Command failed";
  return { category, summary: summaryLine.slice(0, 1000), likelyFiles: [...new Set(files)], retryable: !lower.includes("permission denied") && !lower.includes("command not found") };
}
