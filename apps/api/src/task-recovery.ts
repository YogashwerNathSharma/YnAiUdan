import { db } from "./db.js";

export async function recoverTask(taskId: string, userId: string, tenantId: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  if (task.status !== "FAILED" && task.status !== "PAUSED") return { status: task.status, recovered: false };
  const failed = task.steps.find(step => step.status === "FAILED");
  if (failed) {
    const retries = failed.retryCount ?? 0;
    if (retries >= (task.maxRetries ?? 0)) return { status: "FAILED", recovered: false, reason: "MAX_RETRIES_REACHED", stepId: failed.id };
    await db.taskStep.update({ where: { id: failed.id }, data: { status: "PENDING", retryCount: retries + 1, error: null } });
  }
  await db.task.update({ where: { id: task.id }, data: { status: "RUNNING" } });
  return { status: "RUNNING", recovered: true, checkpoint: task.steps.find(step => step.status === "COMPLETED")?.sequence ?? 0 };
}
