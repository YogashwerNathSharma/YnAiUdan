export type ReviewFinding = { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"; rule: string; message: string; path?: string };
export type CodeReview = { approved: boolean; score: number; findings: ReviewFinding[] };

const secretPatterns = [/password\s*[:=]/i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /private[_-]?key\s*[:=]/i];
const dangerousPatterns = [/child_process/i, /exec\s*\(/i, /eval\s*\(/i, /innerHTML\s*=/i];

export function reviewSource(params: { path: string; content: string }[]): CodeReview {
  const findings: ReviewFinding[] = [];
  for (const file of params) {
    if (/\.env($|\.)/i.test(file.path)) findings.push({ severity: "CRITICAL", rule: "SECRET_FILE", message: "Environment/secret file should not be part of a code change.", path: file.path });
    for (const pattern of secretPatterns) if (pattern.test(file.content)) findings.push({ severity: "HIGH", rule: "HARDCODED_SECRET", message: "Possible hardcoded credential or secret.", path: file.path });
    for (const pattern of dangerousPatterns) if (pattern.test(file.content)) findings.push({ severity: "MEDIUM", rule: "DANGEROUS_API", message: "Potentially dangerous runtime API requires review.", path: file.path });
  }
  const deductions = findings.reduce((sum, f) => sum + (f.severity === "CRITICAL" ? 50 : f.severity === "HIGH" ? 25 : f.severity === "MEDIUM" ? 10 : 2), 0);
  const score = Math.max(0, 100 - deductions);
  return { approved: !findings.some(f => f.severity === "CRITICAL" || f.severity === "HIGH"), score, findings };
}
