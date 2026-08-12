import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

export type AIChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };
export type AIChatRequest = { model: string; messages: AIChatMessage[]; temperature?: number; maxTokens?: number };
export type AIChatResponse = { id: string; model: string; content: string; usage?: { inputTokens?: number; outputTokens?: number } };
export type AIStreamEvent = { type: "text" | "done"; text?: string; response?: AIChatResponse };

export interface AIProvider {
  readonly name: string;
  chat(request: AIChatRequest): Promise<AIChatResponse>;
  stream?(request: AIChatRequest): AsyncIterable<AIStreamEvent>;
}

const providerNameSchema = z.string().trim().min(1).max(100);

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  register(provider: AIProvider): void { this.providers.set(providerNameSchema.parse(provider.name), provider); }
  get(name: string): AIProvider | undefined { return this.providers.get(name); }
  list(): string[] { return [...this.providers.keys()]; }
}

function toOpenAIInput(messages: AIChatMessage[]): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return messages.filter(message => message.role !== "tool").map(message => ({
    role: message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
    content: message.content
  }));
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
  }

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const response = await this.client.responses.create({
      model: request.model,
      input: toOpenAIInput(request.messages),
      temperature: request.temperature,
      max_output_tokens: request.maxTokens
    });
    return { id: response.id, model: response.model, content: response.output_text, usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined };
  }

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const stream = await this.client.responses.create({
      model: request.model,
      input: toOpenAIInput(request.messages),
      temperature: request.temperature,
      max_output_tokens: request.maxTokens,
      stream: true
    });
    let content = "";
    let id = randomUUID();
    let model = request.model;
    for await (const event of stream) {
      if (event.type === "response.created") { id = event.response.id; model = event.response.model; }
      if (event.type === "response.output_text.delta") { content += event.delta; yield { type: "text", text: event.delta }; }
      if (event.type === "response.completed") {
        const response = event.response;
        yield { type: "done", response: { id: response.id, model: response.model, content, usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined } };
      }
    }
  }
}

export class MockProvider implements AIProvider {
  readonly name = "mock";
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const lastUser = [...request.messages].reverse().find(message => message.role === "user");
    return { id: randomUUID(), model: request.model, content: `Development mock received: ${lastUser?.content ?? ""}` };
  }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(new MockProvider());
if (process.env.OPENAI_API_KEY) providerRegistry.register(new OpenAIProvider());

export function resolveProvider(model: string): AIProvider {
  const providerName = model.includes(":") ? model.split(":", 1)[0] : "openai";
  if (providerName === "openai") {
    const provider = providerRegistry.get("openai");
    if (!provider) throw new Error("OpenAI provider is unavailable: configure OPENAI_API_KEY");
    return provider;
  }
  return providerRegistry.get(providerName) ?? providerRegistry.get("mock")!;
}
