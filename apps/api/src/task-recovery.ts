import { db } from "./db.js";

export async function recoverTask(taskId: string, userId: string, tenantId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  if (["CANCELLED", "COMPLETED"].includes(task.status)) return { status: task.status, recovered: false, reason: "TERMINAL_TASK" };
  if (task.status !== "FAILED" && task.status !== "PAUSED") return { status: task.status, recovered: false };
  const failed = task.steps.find(step => step.status === "FAILED");
  if (failed) {
    const retries = failed.retryCount ?? 0;
    if (retries >= (task.maxRetries ?? 0)) return { status: "FAILED", recovered: false, reason: "MAX_RETRIES_REACHED", stepId: failed.id };
    await db.taskStep.updateMany({ where: { id: failed.id, taskId: task.id, status: "FAILED" }, data: { status: "PENDING", retryCount: retries + 1, error: null, startedAt: null, completedAt: null } });
  }
  const claimed = await db.task.updateMany({ where: { id: task.id, userId, tenantId, status: { in: ["FAILED", "PAUSED"] } }, data: { status: "RUNNING" } });
  if (claimed.count !== 1) return { status: "RUNNING", recovered: false, reason: "RECOVERY_RACE_LOST" };
  return { status: "RUNNING", recovered: true, checkpoint: task.steps.filter(step => step.status === "COMPLETED").map(step => step.sequence).sort((a, b) => b - a)[0] ?? 0 };
}
