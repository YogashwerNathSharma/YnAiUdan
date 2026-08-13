import { taskQueue } from "./task-queue.js";
import { processTaskQueueItem } from "./task-worker.js";

export function startTaskWorker(): void {
  void taskQueue.start(processTaskQueueItem);
}
