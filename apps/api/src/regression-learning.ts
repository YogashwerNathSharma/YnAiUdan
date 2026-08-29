import { db } from "./db.js";
import { recordLearning } from "./learning-service.js";

export type RegressionEvidence = { taskId: string; stepId?: string; tenantId: string; userId: string; projectId?: string | null; goal: string; failure?: string; correction?: string; verification?: string; testCommand?: string };

function clean(value: string | undefined, max: number): string | undefined { return value?.trim().slice(0, max); }

export async function captureRegressionLesson(input: RegressionEvidence) {
  const failure = clean(input.failure, 10000);
  const correction = clean(input.correction, 20000);
  const verification = clean(input.verification, 10000);
  const testCommand = clean(input.testCommand, 2000);
  if (!failure && !correction) return null;
  return recordLearning({
    tenantId: input.tenantId,
    userId: input.userId,
    projectId: input.projectId ?? undefined,
    query: input.goal,
    kind: "PATTERN",
    mistake: failure,
    correction,
    solution: correction,
    verification: [verification, testCommand ? `regression-test: ${testCommand}` : undefined].filter(Boolean).join("\n") || undefined,
    confidence: 0.9,
    verified: Boolean(verification)
  });
}

export async function checkRegressionLessons(input: { tenantId: string; userId: string; projectId?: string | null; goal: string }) {
  const rows = await db.learningRecord.findMany({
    where: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? null, kind: "PATTERN", status: "VERIFIED" },
    orderBy: [{ confidence: "desc" }, { successCount: "desc" }, { updatedAt: "desc" }],
    take: 100
  });
  const query = input.goal.toLowerCase();
  return rows.filter(row => {
    const haystack = `${row.normalizedQuery} ${row.mistake ?? ""} ${row.correction ?? ""}`.toLowerCase();
    const terms = query.split(/\s+/).filter(term => term.length >= 4);
    return terms.length > 0 && terms.filter(term => haystack.includes(term)).length / terms.length >= 0.4;
  }).slice(0, 10).map(row => ({ id: row.id, query: row.query, mistake: row.mistake, correction: row.correction, verification: row.verification, confidence: row.confidence }));
}
