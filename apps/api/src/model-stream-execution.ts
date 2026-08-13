import { routeModel, routeProvider } from "./model-router.js";
import type { AIChatMessage, AIStreamEvent } from "./ai.js";

export async function* executeModelStream(params: { task: Parameters<typeof routeModel>[0]; requestedModel?: string; messages: AIChatMessage[]; maxTokens?: number; timeoutMs?: number }): AsyncGenerator<AIStreamEvent> {
  const primary = routeModel(params.task, params.requestedModel);
  const fallback = process.env.AI_FALLBACK_MODEL?.trim() || "mock:default";
  const candidates = [...new Set([primary, fallback])];
  const timeoutMs = Math.min(600_000, Math.max(1_000, params.timeoutMs ?? Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120_000)));
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const provider = routeProvider(candidate);
      const model = candidate.includes(":") ? candidate.split(":").slice(1).join(":") || candidate : candidate;
      if (!provider.stream) {
        const result = await Promise.race([provider.chat({ model, messages: params.messages, maxTokens: params.maxTokens }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs))]);
        yield { type: "text", text: result.content }; yield { type: "done", response: result }; return;
      }
      const iterator = provider.stream({ model, messages: params.messages, maxTokens: params.maxTokens })[Symbol.asyncIterator]();
      while (true) {
        const next = await Promise.race([iterator.next(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`AI stream timed out after ${timeoutMs}ms`)), timeoutMs))]);
        if (next.done) break;
        yield next.value;
      }
      return;
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("AI streaming execution failed");
}
