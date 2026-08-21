import type { ReviewFinding } from "./code-reviewer.js";

export type ArchitectureReview = { approved: boolean; score: number; findings: ReviewFinding[] };

export function reviewArchitecture(files: Array<{ path: string; content: string }>): ArchitectureReview {
  const findings: ReviewFinding[] = [];
  const paths = new Set(files.map(file => file.path));
  const hasEnvExample = [...paths].some(path => /\.env\.example$/i.test(path));
  if (!hasEnvExample) findings.push({ severity: "LOW", rule: "MISSING_ENV_EXAMPLE", message: "Consider providing a safe environment variable template." });
  for (const file of files) {
    if (file.content.length > 150_000) findings.push({ severity: "MEDIUM", rule: "LARGE_MODULE", message: "Large source module may need decomposition.", path: file.path });
    if (/src\/(routes|api)\//i.test(file.path) && /PrismaClient|db\./.test(file.content)) findings.push({ severity: "LOW", rule: "ROUTE_DB_COUPLING", message: "Route appears directly coupled to persistence; consider a service layer.", path: file.path });
  }
  const score = Math.max(0, 100 - findings.reduce((n, f) => n + (f.severity === "MEDIUM" ? 10 : f.severity === "LOW" ? 2 : 25), 0));
  return { approved: !findings.some(f => f.severity === "CRITICAL" || f.severity === "HIGH"), score, findings };
}
