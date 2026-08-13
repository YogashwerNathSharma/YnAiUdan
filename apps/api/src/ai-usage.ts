import { db } from "./db.js";

export type UsageRecord = { tenantId: string; userId: string; taskType: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; latencyMs: number; success: boolean; error?: string };

export async function recordAIUsage(record: UsageRecord): Promise<void> {
  await db.aiUsage.create({ data: { tenantId: record.tenantId, userId: record.userId, taskType: record.taskType, provider: record.provider, model: record.model, inputTokens: record.inputTokens ?? 0, outputTokens: record.outputTokens ?? 0, latencyMs: record.latencyMs, success: record.success, error: record.error?.slice(0, 4000) } });
}
