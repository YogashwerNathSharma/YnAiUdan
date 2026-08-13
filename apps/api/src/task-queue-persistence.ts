import { db } from "./db.js";
import type { QueueJob, TaskQueueBackend } from "./task-queue-backend.js";

/** Durable MongoDB-backed queue. Use QUEUE_BACKEND=mongo until Redis/BullMQ is provisioned. */
export class MongoTaskQueueBackend implements TaskQueueBackend {
  async enqueue(taskId: string): Promise<QueueJob> {
    const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new Error("Task not found");
    const job = await db.taskQueueJob.create({ data: { taskId, status: "QUEUED", attempts: 0 } });
    return { id: job.id, taskId: job.taskId, createdAt: job.createdAt.getTime(), attempts: job.attempts };
  }

  async dequeue(): Promise<QueueJob | null> {
    const job = await db.taskQueueJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
    if (!job) return null;
    const claimed = await db.taskQueueJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } });
    if (claimed.count !== 1) return null;
    return { id: job.id, taskId: job.taskId, createdAt: job.createdAt.getTime(), attempts: job.attempts + 1 };
  }

  async size(): Promise<number> { return db.taskQueueJob.count({ where: { status: "QUEUED" } }); }
  async clear(): Promise<void> { await db.taskQueueJob.deleteMany({ where: { status: "QUEUED" } }); }
}
