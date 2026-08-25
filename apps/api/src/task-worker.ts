import { taskQueue, type QueueJob } from "./task-queue.js";
import { executeNextTaskStep } from "./task-executor.js";
import { db } from "./db.js";

/**
 * Executes exactly one task step per queue lease. The task itself remains the
 * source of truth for whether more work is pending; never infer task
 * completion from a single successful step.
 */
export async function processTaskQueueItem(item: QueueJob): Promise<void> {
  try {
    const task = await db.task.findUnique({
      where: { id: item.taskId },
      include: { user: { select: { role: true } } }
    });

    if (!task || task.status !== "RUNNING") {
      await taskQueue.complete?.(item.id);
      return;
    }

    const result = await executeNextTaskStep(
      task.id,
      task.userId,
      task.tenantId,
      task.user.role
    );

    // A successful step is not necessarily the end of the task. Re-read the
    // task so multi-step plans continue until the executor changes the task
    // state to COMPLETED/PAUSED/WAITING_APPROVAL/FAILED.
    const current = await db.task.findUnique({
      where: { id: task.id },
      select: { status: true }
    });

    await taskQueue.complete?.(item.id);

    if (result.status === "FAILED") {
      await taskQueue.fail?.(item.id, result.error ?? "Task step failed");
      return;
    }

    if (current?.status === "RUNNING") {
      await taskQueue.enqueue(task.id);
    }
  } catch (error) {
    await taskQueue.fail?.(
      item.id,
      error instanceof Error ? error.message : "Task worker failed"
    );
    throw error;
  }
}

export async function recoverStaleQueueJobs(maxAgeMs: number): Promise<number> {
  return taskQueue.recoverStale?.(maxAgeMs) ?? 0;
}
