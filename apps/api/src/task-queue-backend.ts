import { randomUUID } from "node:crypto";
import { MongoTaskQueueBackend } from "./task-queue-persistence.js";
import { isDbDisabled } from "./dev-auth-store.js";

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
  // Explicit override wins.
  if (process.env.QUEUE_BACKEND === "memory") return new MemoryQueueBackend();
  if (process.env.QUEUE_BACKEND === "mongo") return new MongoTaskQueueBackend();
  // Auto: without a DATABASE_URL, Mongo cannot work and every poll would spam
  // the console with validation errors — fall back to the in-memory queue so
  // the dev server runs cleanly.
  if (isDbDisabled()) {
    console.warn("[task-queue] No usable DATABASE_URL (missing or without credentials) — using in-memory queue backend. Set a full MongoDB URL with credentials to enable the MongoDB-backed queue.");
    return new MemoryQueueBackend();
  }
  return new MongoTaskQueueBackend();
}
