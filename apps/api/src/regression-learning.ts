import { db } from "./db.js";
import { recordLearning } from "./learning-service.js";

export type RegressionEvidence = { taskId: string; stepId?: string; tenantId: string; userId: string; projectId?: string | null; goal: string; failure?: string; correction?: string; verification?: string; testCommand?: string };
function clean(value: string | undefined, max: number): string | undefined { return value?.trim().slice(0, max); }
function extractCommands(text: string): string[] { return text.split(/[\n;,]+/).map(x => x.trim()).filter(x => /^(npm|pnpm|yarn|bun|pytest|go test|cargo test|mvn test|gradle test|dotnet test|make test)\b/i.test(x)).slice(0, 5); }

export async function captureRegressionLesson(input: RegressionEvidence) {
  const failure = clean(input.failure, 10000); const correction = clean(input.correction, 20000); const verification = clean(input.verification, 10000); const testCommand = clean(input.testCommand, 2000);
  if (!failure && !correction) return null;
  const commands = [...(testCommand ? [testCommand] : []), ...extractCommands(verification ?? "")].filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
  return recordLearning({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? undefined, query: input.goal, kind: "PATTERN", mistake: failure, correction, solution: correction, verification: [verification, ...commands.map(command => `regression-test: ${command}`)].filter(Boolean).join("\n") || undefined, confidence: 0.9, verified: Boolean(verification) });
}

export async function generateRegressionTestProposal(input: { tenantId: string; userId: string; projectId?: string | null; goal: string; failure?: string; correction?: string; verification?: string; testCommand?: string }) {
  const commands = [...(input.testCommand ? [input.testCommand] : []), ...extractCommands(input.verification ?? "")].filter((x, i, a) => a.indexOf(x) === i).slice(0, 5);
  const existing = await checkRegressionLessons({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, goal: input.goal });
  return { goal: clean(input.goal, 10000), failure: clean(input.failure, 10000), correction: clean(input.correction, 20000), verification: clean(input.verification, 10000), commands, existingRegressionIds: existing.map(item => item.id), proposalStatus: commands.length ? "READY_TO_VERIFY" : "NEEDS_TEST_COMMAND" };
}

export async function checkRegressionLessons(input: { tenantId: string; userId: string; projectId?: string | null; goal: string }) {
  const rows = await db.learningRecord.findMany({ where: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? null, kind: "PATTERN", status: "VERIFIED" }, orderBy: [{ confidence: "desc" }, { successCount: "desc" }, { updatedAt: "desc" }], take: 100 });
  const query = input.goal.toLowerCase();
  return rows.filter(row => { const haystack = `${row.normalizedQuery} ${row.mistake ?? ""} ${row.correction ?? ""}`.toLowerCase(); const terms = query.split(/\s+/).filter(term => term.length >= 4); return terms.length > 0 && terms.filter(term => haystack.includes(term)).length / terms.length >= 0.4; }).slice(0, 10).map(row => ({ id: row.id, query: row.query, mistake: row.mistake, correction: row.correction, verification: row.verification, confidence: row.confidence }));
}
