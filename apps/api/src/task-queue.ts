import { loadQueueConfig, type QueueConfig } from "./task-queue-config.js";
import { createQueueBackend, type QueueJob, type TaskQueueBackend } from "./task-queue-backend.js";

class TaskQueue {
  private running = false;
  private active = 0;
  private config: QueueConfig = loadQueueConfig();
  private backend: TaskQueueBackend = createQueueBackend();
  configure(config: Partial<QueueConfig>): void { this.config = { ...this.config, ...config }; }
  setBackend(backend: TaskQueueBackend): void { if (this.running) throw new Error("Cannot replace queue backend while running"); this.backend = backend; }
  async enqueue(taskId: string): Promise<QueueJob> { if (await this.backend.size() >= this.config.maxInMemoryItems) throw new Error("Task queue capacity reached"); return this.backend.enqueue(taskId); }
  async size(): Promise<number> { return this.backend.size(); }
  activeWorkers(): number { return this.active; }
  async start(worker: (item: QueueJob) => Promise<void>): Promise<void> {
    if (this.running) return; this.running = true;
    while (this.running) {
      if (this.active >= this.config.maxConcurrency) { await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs)); continue; }
      const item = await this.backend.dequeue();
      if (!item) { await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs)); continue; }
      this.active += 1;
      void worker(item).catch(() => undefined).finally(() => { this.active -= 1; });
    }
  }
  stop(): void { this.running = false; }
}
export const taskQueue = new TaskQueue();
export type { QueueJob };
