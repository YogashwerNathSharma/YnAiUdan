import { randomUUID } from "node:crypto";

type QueueItem = { id: string; taskId: string; createdAt: number; attempts: number };

class TaskQueue {
  private readonly items: QueueItem[] = [];
  private running = false;
  enqueue(taskId: string): QueueItem { const item = { id: randomUUID(), taskId, createdAt: Date.now(), attempts: 0 }; this.items.push(item); return item; }
  size(): number { return this.items.length; }
  async start(worker: (item: QueueItem) => Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      const item = this.items.shift();
      if (!item) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
      try { item.attempts += 1; await worker(item); } catch { /* worker persists failure/checkpoint state */ }
    }
  }
  stop(): void { this.running = false; }
}

export const taskQueue = new TaskQueue();
export type { QueueItem };
