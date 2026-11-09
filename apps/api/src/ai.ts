import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

export type AIChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };
export type AIChatRequest = { model: string; messages: AIChatMessage[]; maxTokens?: number };
export type AIChatResponse = { id: string; model: string; content: string; usage?: { inputTokens?: number; outputTokens?: number } };
export type AIStreamEvent = { type: "text" | "done"; text?: string; response?: AIChatResponse };

export interface AIProvider { readonly name: string; chat(request: AIChatRequest): Promise<AIChatResponse>; stream?(request: AIChatRequest): AsyncIterable<AIStreamEvent>; }
const providerNameSchema = z.string().trim().min(1).max(100);

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  register(provider: AIProvider): void { this.providers.set(providerNameSchema.parse(provider.name), provider); }
  get(name: string): AIProvider | undefined { return this.providers.get(name); }
  list(): string[] { return [...this.providers.keys()]; }
}

function toOpenAIInput(messages: AIChatMessage[]): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return messages.filter(message => message.role !== "tool").map(message => ({ role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user", content: message.content }));
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  constructor() { const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) throw new Error("OPENAI_API_KEY is not configured"); this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 }); }
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const response = await this.client.responses.create({ model: request.model, input: toOpenAIInput(request.messages), max_output_tokens: request.maxTokens });
    return { id: response.id, model: response.model, content: response.output_text, usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined };
  }
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const stream = await this.client.responses.create({ model: request.model, input: toOpenAIInput(request.messages), max_output_tokens: request.maxTokens, stream: true });
    let content = "";
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") { content += event.delta; yield { type: "text", text: event.delta }; }
      if (event.type === "response.completed") { const response = event.response; yield { type: "done", response: { id: response.id, model: response.model, content, usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined } }; }
    }
  }
}

export class MockProvider implements AIProvider { readonly name = "mock"; async chat(request: AIChatRequest): Promise<AIChatResponse> { const lastUser = [...request.messages].reverse().find(message => message.role === "user"); return { id: randomUUID(), model: request.model, content: `[mock provider, requested model=${request.model}, GROQ_API_KEY set=${Boolean(process.env.GROQ_API_KEY)}] ${lastUser?.content ?? ""}` }; } }

export class GroqProvider implements AIProvider {
  readonly name = "groq";
  private readonly client: OpenAI;
  constructor() { const apiKey = process.env.GROQ_API_KEY; if (!apiKey) throw new Error("GROQ_API_KEY is not configured"); this.client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1", timeout: 120_000, maxRetries: 2 }); }
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const completion = await this.client.chat.completions.create({ model: request.model, messages: request.messages.filter(m => m.role !== "tool").map(m => ({ role: m.role as "system" | "user" | "assistant", content: m.content })), max_tokens: request.maxTokens });
    const choice = completion.choices[0];
    return { id: completion.id, model: completion.model, content: choice?.message?.content ?? "", usage: completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : undefined };
  }
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const stream = await this.client.chat.completions.create({ model: request.model, messages: request.messages.filter(m => m.role !== "tool").map(m => ({ role: m.role as "system" | "user" | "assistant", content: m.content })), max_tokens: request.maxTokens, stream: true });
    let content = ""; let id: string = randomUUID(); let model = request.model;
    for await (const chunk of stream) {
      id = chunk.id ?? id; model = chunk.model ?? model;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) { content += delta; yield { type: "text", text: delta }; }
    }
    yield { type: "done", response: { id, model, content } };
  }
}

// Google Gemini via its OpenAI-compatible endpoint. No extra SDK needed — the
// official OpenAI client works against the Gemini baseURL below. Use models
// prefixed with "gemini:", e.g. gemini:gemini-2.0-flash or gemini:gemini-1.5-pro.
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private readonly client: OpenAI;
  constructor() { const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) throw new Error("GEMINI_API_KEY is not configured"); this.client = new OpenAI({ apiKey, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", timeout: 120_000, maxRetries: 2 }); }
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const completion = await this.client.chat.completions.create({ model: request.model, messages: request.messages.filter(m => m.role !== "tool").map(m => ({ role: m.role as "system" | "user" | "assistant", content: m.content })), max_tokens: request.maxTokens });
    const choice = completion.choices[0];
    return { id: completion.id, model: completion.model, content: choice?.message?.content ?? "", usage: completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : undefined };
  }
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const stream = await this.client.chat.completions.create({ model: request.model, messages: request.messages.filter(m => m.role !== "tool").map(m => ({ role: m.role as "system" | "user" | "assistant", content: m.content })), max_tokens: request.maxTokens, stream: true });
    let content = ""; let id: string = randomUUID(); let model = request.model;
    for await (const chunk of stream) {
      id = chunk.id ?? id; model = chunk.model ?? model;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) { content += delta; yield { type: "text", text: delta }; }
    }
    yield { type: "done", response: { id, model, content } };
  }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(new MockProvider());

function ensureProvidersRegistered(): void {
  if (process.env.OPENAI_API_KEY && !providerRegistry.get("openai")) providerRegistry.register(new OpenAIProvider());
  if (process.env.GROQ_API_KEY && !providerRegistry.get("groq")) providerRegistry.register(new GroqProvider());
  if (process.env.GEMINI_API_KEY && !providerRegistry.get("gemini")) providerRegistry.register(new GeminiProvider());
}

export function resolveProvider(model: string): AIProvider {
  ensureProvidersRegistered();
  const providerName = model.includes(":") ? model.split(":", 1)[0] : "openai";
  const provider = providerRegistry.get(providerName);
  if (provider) return provider;
  if (providerName === "openai") throw new Error("OpenAI provider is unavailable: configure OPENAI_API_KEY");
  if (providerName === "groq") throw new Error("Groq provider is unavailable: configure GROQ_API_KEY");
  if (providerName === "gemini") throw new Error("Gemini provider is unavailable: configure GEMINI_API_KEY");
  return providerRegistry.get("mock")!;
}
