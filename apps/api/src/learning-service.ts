import { db } from "./db.js";

function normalizeQuery(query: string): string { return query.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function tokenize(value: string): Set<string> { return new Set(normalizeQuery(value).split(" ").filter(term => term.length >= 3)); }
function lexicalScore(a: string, b: string): number { const left = tokenize(a); const right = tokenize(b); if (!left.size || !right.size) return 0; let overlap = 0; for (const term of left) if (right.has(term)) overlap++; return overlap / left.size; }

export async function recordLearning(input: { tenantId: string; userId: string; projectId?: string; query: string; kind: "SOLUTION" | "CORRECTION" | "MISTAKE" | "PATTERN" | "PREFERENCE"; solution?: string; mistake?: string; rootCause?: string; correction?: string; verification?: string; confidence?: number; verified?: boolean }) {
  const normalizedQuery = normalizeQuery(input.query);
  const existing = await db.learningRecord.findMany({ where: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, kind: input.kind, status: { in: ["CANDIDATE", "VERIFIED"] } }, orderBy: { updatedAt: "desc" }, take: 50 });
  const duplicate = existing.find(row => lexicalScore(normalizedQuery, row.normalizedQuery) >= 0.92 && lexicalScore(row.normalizedQuery, normalizedQuery) >= 0.92);
  if (duplicate) {
    const successCount = duplicate.successCount + (input.verified ? 1 : 0); const failureCount = duplicate.failureCount; const confidence = clamp(Math.max(duplicate.confidence, input.confidence ?? 0.5));
    return db.learningRecord.update({ where: { id: duplicate.id }, data: { status: input.verified ? "VERIFIED" : duplicate.status, solution: input.solution?.slice(0, 20000) ?? duplicate.solution, mistake: input.mistake?.slice(0, 10000) ?? duplicate.mistake, rootCause: input.rootCause?.slice(0, 10000) ?? duplicate.rootCause, correction: input.correction?.slice(0, 20000) ?? duplicate.correction, verification: input.verification?.slice(0, 10000) ?? duplicate.verification, confidence, successCount, failureCount } });
  }
  return db.learningRecord.create({ data: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, query: input.query.slice(0, 10000), normalizedQuery, kind: input.kind, status: input.verified ? "VERIFIED" : "CANDIDATE", solution: input.solution?.slice(0, 20000), mistake: input.mistake?.slice(0, 10000), rootCause: input.rootCause?.slice(0, 10000), correction: input.correction?.slice(0, 20000), verification: input.verification?.slice(0, 10000), confidence: clamp(input.confidence ?? (input.verified ? 0.9 : 0.5)) } });
}

export async function findLearning(query: string, context: { tenantId: string; userId: string; projectId?: string; limit?: number; excludeKinds?: Array<"MISTAKE" | "SOLUTION" | "CORRECTION" | "PATTERN" | "PREFERENCE"> }) {
  const normalized = normalizeQuery(query); if (!normalized) return [];
  const rows = await db.learningRecord.findMany({ where: { tenantId: context.tenantId, userId: context.userId, status: "VERIFIED", ...(context.excludeKinds?.length ? { kind: { notIn: context.excludeKinds } } : {}), OR: [{ projectId: context.projectId }, { projectId: null }] }, orderBy: [{ confidence: "desc" }, { successCount: "desc" }, { updatedAt: "desc" }], take: 100 });
  return rows.map(row => { const lexical = lexicalScore(normalized, row.normalizedQuery); const projectBoost = context.projectId && row.projectId === context.projectId ? 0.15 : 0; const totalOutcomes = row.successCount + row.failureCount; const successRate = totalOutcomes > 0 ? row.successCount / totalOutcomes : 0.5; const score = lexical * 0.55 + row.confidence * 0.25 + successRate * 0.20 + projectBoost; return { row, score }; }).filter(item => item.score >= 0.25).sort((a, b) => b.score - a.score).slice(0, Math.min(context.limit ?? 5, 10)).map(item => item.row);
}

export async function findFailureLessons(query: string, context: { tenantId: string; userId: string; projectId?: string; limit?: number }) {
  const normalized = normalizeQuery(query); if (!normalized) return [];
  const rows = await db.learningRecord.findMany({ where: { tenantId: context.tenantId, userId: context.userId, kind: "MISTAKE", OR: [{ projectId: context.projectId }, { projectId: null }] }, orderBy: [{ updatedAt: "desc" }], take: 100 });
  return rows.map(row => { const lexical = Math.max(lexicalScore(normalized, row.normalizedQuery), lexicalScore(normalized, `${row.mistake ?? ""} ${row.rootCause ?? ""}`)); return { row, score: lexical }; }).filter(x => x.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, context.limit ?? 5).map(x => x.row);
}

export async function markLearningOutcome(input: { id: string; tenantId: string; userId: string; success: boolean; verification?: string }) {
  const existing = await db.learningRecord.findFirst({ where: { id: input.id, tenantId: input.tenantId, userId: input.userId } }); if (!existing) throw new Error("Learning record not found");
  const total = existing.successCount + existing.failureCount + 1; const successCount = existing.successCount + (input.success ? 1 : 0); const failureCount = existing.failureCount + (input.success ? 0 : 1); const confidence = clamp((existing.confidence * 0.7) + ((successCount / total) * 0.3));
  return db.learningRecord.update({ where: { id: existing.id }, data: { successCount, failureCount, confidence, ...(input.verification ? { verification: input.verification.slice(0, 10000) } : {}) } });
}
