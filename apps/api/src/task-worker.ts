import { taskQueue, type QueueJob } from "./task-queue.js";
import { executeNextTaskStep } from "./task-executor.js";
import { db } from "./db.js";

/** Executes exactly one task step per queue lease. */
export async function processTaskQueueItem(item: QueueJob): Promise<void> {
  try {
    const task = await db.task.findUnique({ where: { id: item.taskId }, include: { user: { select: { role: true } } } });
    if (!task || task.status !== "RUNNING") { await taskQueue.complete(item.id); return; }

    const result = await executeNextTaskStep(task.id, task.userId, task.tenantId, task.user.role);
    const current = await db.task.findUnique({ where: { id: task.id }, select: { status: true } });

    // Never mark a failed job COMPLETED. Persist failure first so recovery can
    // see the failed queue lease and the task's failed step consistently.
    if (result.status === "FAILED") {
      await taskQueue.fail(item.id, result.error ?? "Task step failed");
      return;
    }

    await taskQueue.complete(item.id);
    if (current?.status === "RUNNING") await taskQueue.enqueue(task.id);
  } catch (error) {
    await taskQueue.fail(item.id, error instanceof Error ? error.message : "Task worker failed");
    throw error;
  }
}

export async function recoverStaleQueueJobs(maxAgeMs: number): Promise<number> {
  return taskQueue.recoverStale?.(maxAgeMs) ?? 0;
}
