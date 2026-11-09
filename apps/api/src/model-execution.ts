import { routeModel, routeProvider } from "./model-router.js";
import type { AIChatRequest, AIChatResponse } from "./ai.js";

export type ModelExecutionLimits = { maxTokens?: number; timeoutMs?: number; maxRetries?: number };

const intEnv = (key: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

// Build the ordered list of models to try. The requested model goes first,
// then EVERY other real provider that has an API key configured, so that if
// one provider is down / a model is retired (e.g. a 404), the AI simply keeps
// working on the next real provider instead of falling back to the useless
// "mock" provider (which returns canned nonsense and makes features like
// image-intent detection behave as if the AI had failed). The mock provider is
// only ever used as an absolute last resort when NO real key is configured.
export function buildCandidates(primary: string): string[] {
  const out: string[] = [primary];
  const push = (m?: string) => { if (m && !out.includes(m)) out.push(m); };

  // Explicit override always respected first.
  push(process.env.AI_FALLBACK_MODEL?.trim());

  // Then a good default model for each configured real provider.
  if (process.env.GEMINI_API_KEY?.trim()) push("gemini:gemini-2.0-flash");
  if (process.env.GROQ_API_KEY?.trim()) push("groq:llama-3.3-70b-versatile");
  if (process.env.OPENAI_API_KEY?.trim()) push("openai:gpt-4o-mini");

  // Mock only as a last resort when NO real provider is in the list.
  if (!out.some(m => /^(gemini|groq|openai):/.test(m))) push("mock:default");
  return out;
}

export async function executeModel(request: Omit<AIChatRequest, "model"> & { task: Parameters<typeof routeModel>[0]; requestedModel?: string; limits?: ModelExecutionLimits }): Promise<AIChatResponse> {
  const model = routeModel(request.task, request.requestedModel);
  const timeoutMs = intEnv("AI_REQUEST_TIMEOUT_MS", request.limits?.timeoutMs ?? 120_000, 1_000, 600_000);
  const retries = Math.min(10, Math.max(0, request.limits?.maxRetries ?? intEnv("AI_MAX_RETRIES", 2, 0, 10)));
  const maxTokens = request.limits?.maxTokens ?? intEnv("AI_MAX_OUTPUT_TOKENS", 16_384, 128, 131_072);

  const candidates = buildCandidates(model);
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
