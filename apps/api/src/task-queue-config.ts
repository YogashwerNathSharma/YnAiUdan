import { z } from "zod";

export const queueConfigSchema = z.object({
  maxConcurrency: z.number().int().min(1).max(32).default(2),
  pollIntervalMs: z.number().int().min(50).max(10_000).default(250),
  maxInMemoryItems: z.number().int().min(1).max(100_000).default(10_000)
});

export type QueueConfig = z.infer<typeof queueConfigSchema>;

export function loadQueueConfig(env: NodeJS.ProcessEnv = process.env): QueueConfig {
  return queueConfigSchema.parse({
    maxConcurrency: Number(env.TASK_WORKER_CONCURRENCY ?? 2),
    pollIntervalMs: Number(env.TASK_QUEUE_POLL_MS ?? 250),
    maxInMemoryItems: Number(env.TASK_QUEUE_MAX_ITEMS ?? 10_000)
  });
}
