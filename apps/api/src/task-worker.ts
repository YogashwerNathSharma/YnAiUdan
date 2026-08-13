import { taskQueue, type QueueItem } from "./task-queue.js";
import { executeNextTaskStep } from "./task-executor.js";
import { db } from "./db.js";

export async function processTaskQueueItem(item: QueueItem): Promise<void> {
  const task = await db.task.findUnique({ where: { id: item.taskId } });
  if (!task || task.status !== "RUNNING") return;
  const result = await executeNextTaskStep(task.id, task.userId, task.tenantId, "AGENT");
  if (result.status === "COMPLETED") return;
  if (result.status === "FAILED") throw new Error(result.error ?? "Task step failed");
  if (result.status === "PAUSED" || result.status === "WAITING_APPROVAL") return;
  taskQueue.enqueue(task.id);
}
