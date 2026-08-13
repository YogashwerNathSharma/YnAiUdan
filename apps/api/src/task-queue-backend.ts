import { randomUUID } from "node:crypto";
import { MongoTaskQueueBackend } from "./task-queue-persistence.js";

export type QueueJob = { id: string; taskId: string; createdAt: number; attempts: number };

export interface TaskQueueBackend {
  enqueue(taskId: string): Promise<QueueJob>;
  dequeue(): Promise<QueueJob | null>;
  complete?(jobId: string): Promise<void>;
  fail?(jobId: string, error: string): Promise<void>;
  recoverStale?(maxAgeMs: number): Promise<number>;
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
  return process.env.QUEUE_BACKEND === "memory" ? new MemoryQueueBackend() : new MongoTaskQueueBackend();
}
