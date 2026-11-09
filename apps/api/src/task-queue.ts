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
  async complete(jobId: string): Promise<void> { await this.backend.complete?.(jobId); }
  async fail(jobId: string, error: string): Promise<void> { await this.backend.fail?.(jobId, error); }
  async recoverStale(maxAgeMs: number): Promise<number> { return this.backend.recoverStale?.(maxAgeMs) ?? 0; }
  async size(): Promise<number> { return this.backend.size(); }
  activeWorkers(): number { return this.active; }
  async start(worker: (item: QueueJob) => Promise<void>): Promise<void> {
    if (this.running) return; this.running = true;
    let consecutiveErrors = 0;
    while (this.running) {
      try {
        if (this.active >= this.config.maxConcurrency) { await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs)); continue; }
        const item = await this.backend.dequeue();
        consecutiveErrors = 0;
        if (!item) { await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs)); continue; }
        this.active += 1;
        void worker(item).catch(() => undefined).finally(() => { this.active -= 1; });
      } catch (error) {
        consecutiveErrors += 1;
        // Only log the first failure and then occasionally, so a missing/unreachable
        // database does not flood the terminal with the same error forever.
        if (consecutiveErrors === 1 || consecutiveErrors % 20 === 0) {
          console.error(`Task queue poll failed (is the database reachable?) [x${consecutiveErrors}]:`, error instanceof Error ? error.message : error);
        }
        // Back off: grow the wait up to 30s while errors persist.
        const backoff = Math.min(30_000, this.config.pollIntervalMs * Math.min(consecutiveErrors, 30));
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  stop(): void { this.running = false; }
}
export const taskQueue = new TaskQueue();
export type { QueueJob };
