import { randomUUID } from "node:crypto";
import { loadQueueConfig, type QueueConfig } from "./task-queue-config.js";

type QueueItem = { id: string; taskId: string; createdAt: number; attempts: number };

class TaskQueue {
  private readonly items: QueueItem[] = [];
  private running = false;
  private active = 0;
  private config: QueueConfig = loadQueueConfig();
  configure(config: Partial<QueueConfig>): void { this.config = { ...this.config, ...config }; }
  enqueue(taskId: string): QueueItem {
    if (this.items.length >= this.config.maxInMemoryItems) throw new Error("Task queue capacity reached");
    const item = { id: randomUUID(), taskId, createdAt: Date.now(), attempts: 0 }; this.items.push(item); return item;
  }
  size(): number { return this.items.length; }
  activeWorkers(): number { return this.active; }
  async start(worker: (item: QueueItem) => Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    const run = async (): Promise<void> => {
      while (this.running) {
        if (this.active >= this.config.maxConcurrency || this.items.length === 0) { await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs)); continue; }
        const item = this.items.shift(); if (!item) continue;
        this.active += 1;
        void worker(item).catch(() => undefined).finally(() => { this.active -= 1; });
      }
    };
    await run();
  }
  stop(): void { this.running = false; }
}

export const taskQueue = new TaskQueue();
export type { QueueItem };
