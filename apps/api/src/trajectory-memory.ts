import { db } from "./db.js";

export type TrajectoryEvent = { phase: string; status?: string; tool?: string; error?: string; evidence?: unknown; strategy?: string };

export async function summarizeTaskTrajectory(taskId: string, tenantId: string, userId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, tenantId, userId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  const events: TrajectoryEvent[] = task.steps.map(step => ({ phase: step.type ?? "TOOL", status: step.status, tool: typeof step.input === "object" && step.input ? String((step.input as Record<string, unknown>).toolName ?? "") : undefined, error: step.error ?? undefined, evidence: typeof step.output === "object" ? (step.output as Record<string, unknown>)?.evidence : undefined }));
  const failures = events.filter(event => event.status === "FAILED");
  const completed = events.filter(event => event.status === "COMPLETED");
  const evidenceCount = events.filter(event => event.evidence != null).length;
  return { taskId, goal: task.goal, status: task.status, autonomyMode: task.autonomyMode, events, summary: { totalSteps: events.length, completedSteps: completed.length, failures: failures.length, evidenceCount, recoveryAttempts: Math.max(0, failures.length - 1) } };
}
