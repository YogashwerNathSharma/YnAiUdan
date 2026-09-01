import { db } from "./db.js";

export type StrategyOutcome = "SUCCESS" | "FAILURE";
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export async function recordStrategyOutcome(input: { tenantId: string; userId: string; projectId?: string | null; goal: string; strategy: string; outcome: StrategyOutcome; evidence?: string }) {
  const query = input.goal.trim().replace(/\s+/g, " ").slice(0, 2000); const strategy = input.strategy.trim().slice(0, 5000);
  const existing = await db.learningRecord.findMany({ where: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? null, kind: "PATTERN", status: { in: ["CANDIDATE", "VERIFIED"] } }, orderBy: { updatedAt: "desc" }, take: 100 });
  const match = existing.find((row) => row.query.toLowerCase() === query.toLowerCase() && row.solution?.trim() === strategy);
  if (match) { const successCount = match.successCount + (input.outcome === "SUCCESS" ? 1 : 0); const failureCount = match.failureCount + (input.outcome === "FAILURE" ? 1 : 0); const total = successCount + failureCount; const successRate = total ? successCount / total : 0.5; const confidence = clamp((match.confidence * 0.65) + (successRate * 0.35)); const status = input.outcome === "FAILURE" && total >= 3 && successRate < 0.34 ? "REJECTED" : input.outcome === "SUCCESS" ? "VERIFIED" : match.status; return db.learningRecord.update({ where: { id: match.id }, data: { successCount, failureCount, confidence, status, verification: input.evidence?.slice(0, 10000) ?? match.verification } }); }
  return db.learningRecord.create({ data: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? undefined, query, normalizedQuery: query.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").replace(/\s+/g, " ").trim(), kind: "PATTERN", status: input.outcome === "SUCCESS" ? "VERIFIED" : "CANDIDATE", solution: strategy, verification: input.evidence?.slice(0, 10000), confidence: input.outcome === "SUCCESS" ? 0.9 : 0.35, successCount: input.outcome === "SUCCESS" ? 1 : 0, failureCount: input.outcome === "FAILURE" ? 1 : 0 } });
}

export async function rankStrategies(input: { tenantId: string; userId: string; projectId?: string | null; goal: string; limit?: number }) {
  const rows = await db.learningRecord.findMany({ where: { tenantId: input.tenantId, userId: input.userId, kind: "PATTERN", status: "VERIFIED", OR: [{ projectId: input.projectId ?? null }, { projectId: null }] }, orderBy: [{ confidence: "desc" }, { successCount: "desc" }, { updatedAt: "desc" }], take: 100 });
  const terms = input.goal.toLowerCase().split(/\s+/).filter((term) => term.length >= 3);
  return rows.map((row) => { const text = `${row.query} ${row.solution ?? ""}`.toLowerCase(); const overlap = terms.filter((term) => text.includes(term)).length; const total = row.successCount + row.failureCount; const successRate = total ? row.successCount / total : 0.5; const evidenceBoost = row.verification?.trim() ? 0.08 : 0; const experienceBoost = Math.min(0.12, Math.log1p(total) * 0.04); const score = overlap * 0.10 + row.confidence * 0.32 + successRate * 0.48 + evidenceBoost + experienceBoost; return { strategy: row.solution, score, successCount: row.successCount, failureCount: row.failureCount, confidence: row.confidence, evidenceBacked: Boolean(row.verification?.trim()) }; }).filter((item) => item.strategy && item.score >= 0.25).sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
}
