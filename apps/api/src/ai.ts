import { randomUUID } from "node:crypto";
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

export class MockProvider implements AIProvider {
  readonly name = "mock";
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const lastUser = [...request.messages].reverse().find(message => message.role === "user");
    return { id: randomUUID(), model: request.model, content: `YnAiUdan AI gateway received: ${lastUser?.content ?? ""}` };
  }
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const response = await this.chat(request);
    for (const text of response.content.split(/(\s+)/)) { if (text) yield { type: "text", text }; await new Promise(resolve => setTimeout(resolve, 8)); }
    yield { type: "done", response };
  }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(new MockProvider());
export function resolveProvider(model: string): AIProvider { const providerName = model.includes(":") ? model.split(":", 1)[0] : "mock"; return providerRegistry.get(providerName) ?? providerRegistry.get("mock")!; }
