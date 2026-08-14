import type { ModelTask } from "./model-router.js";
import { providerAvailable } from "./model-router.js";

export type AIPolicy = {
  allowedProviders: string[];
  maxOutputTokens: number;
  maxInputCharacters: number;
  maxRetries: number;
  timeoutMs: number;
};

const intEnv = (key: string, fallback: number, min: number, max: number): number => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

export function getAIPolicy(): AIPolicy {
  return {
    allowedProviders: (process.env.AI_ALLOWED_PROVIDERS ?? "openai,mock").split(",").map(value => value.trim()).filter(Boolean),
    maxOutputTokens: intEnv("AI_MAX_OUTPUT_TOKENS", 16_384, 128, 131_072),
    maxInputCharacters: intEnv("AI_MAX_INPUT_CHARACTERS", 200_000, 1_000, 2_000_000),
    maxRetries: intEnv("AI_MAX_RETRIES", 2, 0, 10),
    timeoutMs: intEnv("AI_REQUEST_TIMEOUT_MS", 120_000, 1_000, 600_000)
  };
}

export function assertAIRequest(task: ModelTask, model: string, inputCharacters: number, requestedMaxTokens?: number): void {
  const policy = getAIPolicy();
  const provider = model.includes(":") ? model.split(":", 1)[0] : "openai";
  if (!policy.allowedProviders.includes(provider)) throw new Error(`AI provider '${provider}' is disabled by policy for ${task}`);
  if (!providerAvailable(model)) throw new Error(`AI provider '${provider}' is not configured`);
  if (inputCharacters > policy.maxInputCharacters) throw new Error(`AI input exceeds ${policy.maxInputCharacters} characters`);
  if (requestedMaxTokens !== undefined && requestedMaxTokens > policy.maxOutputTokens) throw new Error(`AI maxTokens exceeds policy limit of ${policy.maxOutputTokens}`);
}
