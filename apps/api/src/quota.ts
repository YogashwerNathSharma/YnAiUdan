import { db } from "./db.js";

export type LimitMode = "UNLIMITED" | "CUSTOM" | "DISABLED";
export type UsageLimits = { mode: LimitMode; dailyTokens?: number; monthlyTokens?: number; perTaskTokens?: number };

const positive = (value: unknown): number | undefined => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : undefined; };

export function getUsageLimits(): UsageLimits {
  const mode = (process.env.AI_USAGE_MODE ?? "UNLIMITED").toUpperCase() as LimitMode;
  return { mode: ["UNLIMITED", "CUSTOM", "DISABLED"].includes(mode) ? mode : "UNLIMITED", dailyTokens: positive(process.env.AI_DAILY_TOKEN_LIMIT), monthlyTokens: positive(process.env.AI_MONTHLY_TOKEN_LIMIT), perTaskTokens: positive(process.env.AI_PER_TASK_TOKEN_LIMIT) };
}

export async function assertUsageAllowed(tenantId: string, userId: string, estimatedTokens = 0): Promise<void> {
  const limits = getUsageLimits();
  if (limits.mode === "UNLIMITED") return;
  if (limits.mode === "DISABLED") throw new Error("AI usage is disabled");
  const now = new Date(); const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [daily, monthly] = await Promise.all([
    db.aiUsage.aggregate({ _sum: { inputTokens: true, outputTokens: true }, where: { tenantId, userId, createdAt: { gte: dayStart } } }),
    db.aiUsage.aggregate({ _sum: { inputTokens: true, outputTokens: true }, where: { tenantId, userId, createdAt: { gte: monthStart } } })
  ]);
  const dailyUsed = (daily._sum.inputTokens ?? 0) + (daily._sum.outputTokens ?? 0); const monthlyUsed = (monthly._sum.inputTokens ?? 0) + (monthly._sum.outputTokens ?? 0);
  if (limits.dailyTokens !== undefined && dailyUsed + estimatedTokens > limits.dailyTokens) throw new Error("Daily AI token limit reached");
  if (limits.monthlyTokens !== undefined && monthlyUsed + estimatedTokens > limits.monthlyTokens) throw new Error("Monthly AI token limit reached");
}
