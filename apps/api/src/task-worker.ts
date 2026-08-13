import { taskQueue, type QueueJob } from "./task-queue.js";
import { executeNextTaskStep } from "./task-executor.js";
import { db } from "./db.js";

export async function processTaskQueueItem(item: QueueJob): Promise<void> {
  try {
    const task = await db.task.findUnique({ where: { id: item.taskId } });
    if (!task || task.status !== "RUNNING") { await taskQueue.complete?.(item.id); return; }
    const result = await executeNextTaskStep(task.id, task.userId, task.tenantId, "AGENT");
    if (result.status === "COMPLETED" || result.status === "PAUSED" || result.status === "WAITING_APPROVAL") { await taskQueue.complete?.(item.id); return; }
    if (result.status === "FAILED") { await taskQueue.fail?.(item.id, result.error ?? "Task step failed"); return; }
    await taskQueue.complete?.(item.id);
    await taskQueue.enqueue(task.id);
  } catch (error) {
    await taskQueue.fail?.(item.id, error instanceof Error ? error.message : "Task worker failed");
    throw error;
  }
}

export async function recoverStaleQueueJobs(maxAgeMs: number): Promise<number> {
  return taskQueue.recoverStale?.(maxAgeMs) ?? 0;
}
