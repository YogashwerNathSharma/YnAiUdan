import { randomUUID } from "node:crypto";

export type QueueJob = { id: string; taskId: string; createdAt: number; attempts: number };

export interface TaskQueueBackend {
  enqueue(taskId: string): Promise<QueueJob>;
  dequeue(): Promise<QueueJob | null>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

export class MemoryQueueBackend implements TaskQueueBackend {
  private readonly items: QueueJob[] = [];
  async enqueue(taskId: string): Promise<QueueJob> { const job = { id: randomUUID(), taskId, createdAt: Date.now(), attempts: 0 }; this.items.push(job); return job; }
  async dequeue(): Promise<QueueJob | null> { return this.items.shift() ?? null; }
  async size(): Promise<number> { return this.items.length; }
  async clear(): Promise<void> { this.items.length = 0; }
}

export function createQueueBackend(): TaskQueueBackend {
  // Persistent Redis/BullMQ can implement this interface later without changing the agent API.
  return new MemoryQueueBackend();
}
