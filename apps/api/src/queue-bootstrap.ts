import { taskQueue } from "./task-queue.js";
import { processTaskQueueItem, type EngineeringWorkerDeps } from "./task-worker.js";

export function startTaskWorker(engineeringDeps?: EngineeringWorkerDeps): void {
  void taskQueue.start(item => processTaskQueueItem(item, engineeringDeps));
}
