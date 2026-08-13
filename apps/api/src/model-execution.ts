import { routeModel, routeProvider } from "./model-router.js";
import type { AIChatRequest, AIChatResponse } from "./ai.js";

export type ModelExecutionLimits = { maxTokens?: number; timeoutMs?: number; maxRetries?: number };

const intEnv = (key: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export async function executeModel(request: Omit<AIChatRequest, "model"> & { task: Parameters<typeof routeModel>[0]; requestedModel?: string; limits?: ModelExecutionLimits }): Promise<AIChatResponse> {
  const model = routeModel(request.task, request.requestedModel);
  const fallback = process.env.AI_FALLBACK_MODEL?.trim() || "mock:default";
  const timeoutMs = intEnv("AI_REQUEST_TIMEOUT_MS", request.limits?.timeoutMs ?? 120_000, 1_000, 600_000);
  const retries = Math.min(10, Math.max(0, request.limits?.maxRetries ?? intEnv("AI_MAX_RETRIES", 2, 0, 10)));
  const maxTokens = request.limits?.maxTokens ?? intEnv("AI_MAX_OUTPUT_TOKENS", 16_384, 128, 131_072);

  const candidates = [...new Set([model, fallback])];
  let lastError: unknown;
  for (const candidate of candidates) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const provider = routeProvider(candidate);
        const payload = { model: candidate.includes(":") ? candidate.split(":").slice(1).join(":") || candidate : candidate, messages: request.messages, maxTokens };
        return await Promise.race([
          provider.chat(payload),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs))
        ]);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI execution failed");
}
