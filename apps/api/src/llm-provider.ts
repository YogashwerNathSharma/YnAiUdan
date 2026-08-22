import type { AIChatRequest, AIChatResponse, AIProvider } from "./ai.js";

/** Coder-facing provider contract. Kept compatible with the API AI provider. */
export type LlmProvider = AIProvider;

export type LlmRequest = AIChatRequest;
export type LlmResponse = AIChatResponse;

export function asLlmProvider(provider: AIProvider): LlmProvider {
  return provider;
}
