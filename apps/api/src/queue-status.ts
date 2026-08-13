import type { FastifyInstance } from "fastify";
import { taskQueue } from "./task-queue.js";

export async function registerQueueRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/tasks/queue/status", async () => ({
    queued: taskQueue.size(),
    activeWorkers: taskQueue.activeWorkers(),
    status: "RUNNING"
  }));
}
