import { db } from "./db.js";
import { recordLearning } from "./learning-service.js";

export async function learnFromFailedStep(input: { taskId: string; stepId: string; tenantId: string; userId: string; projectId?: string | null; goal: string; toolName: string; error?: string }) {
  const prior = await db.learningRecord.findFirst({ where: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? null, query: input.goal, kind: "MISTAKE", mistake: { contains: input.toolName } }, orderBy: { updatedAt: "desc" } });
  if (prior) return prior;
  return recordLearning({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? undefined, query: input.goal, kind: "MISTAKE", mistake: `Tool ${input.toolName} failed: ${input.error ?? "unknown error"}`, rootCause: "Execution failure recorded before retry", verification: `task=${input.taskId};step=${input.stepId}`, confidence: 0.35, verified: false });
}

export async function promoteRecoveredSolution(input: { tenantId: string; userId: string; projectId?: string | null; goal: string; toolName: string; solution: string; verification: string }) {
  return recordLearning({ tenantId: input.tenantId, userId: input.userId, projectId: input.projectId ?? undefined, query: input.goal, kind: "SOLUTION", solution: input.solution, verification: input.verification, confidence: 0.95, verified: true });
}
