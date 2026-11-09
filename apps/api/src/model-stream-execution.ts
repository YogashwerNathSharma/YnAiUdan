import { routeModel, routeProvider } from "./model-router.js";
import { buildCandidates } from "./model-execution.js";
import type { AIChatMessage, AIStreamEvent } from "./ai.js";

export async function* executeModelStream(params: { task: Parameters<typeof routeModel>[0]; requestedModel?: string; messages: AIChatMessage[]; maxTokens?: number; timeoutMs?: number }): AsyncGenerator<AIStreamEvent> {
  const primary = routeModel(params.task, params.requestedModel);
  // Use the SAME smart fallback as non-streaming: try the requested model
  // first, then every other configured real provider (Gemini/Groq/OpenAI), so
  // a retired model / 404 on one provider transparently continues on another
  // instead of surfacing the raw error to the user.
  const candidates = buildCandidates(primary);
  const timeoutMs = Math.min(600_000, Math.max(1_000, params.timeoutMs ?? Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120_000)));
  let lastError: unknown;
  for (const candidate of candidates) {
    // If a provider fails AFTER streaming some text, we must NOT fall back to
    // another provider (that would splice two different answers together).
    // Only fall back when the failure happened before any text was produced.
    let yieldedAny = false;
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
        yieldedAny = true;
        yield next.value;
      }
      return;
    } catch (error) {
      lastError = error;
      // Output already started — surface the error instead of switching mid-answer.
      if (yieldedAny) throw error instanceof Error ? error : new Error("AI streaming execution failed");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI streaming execution failed");
}
