import { randomUUID } from "node:crypto";
import { z } from "zod";

export type AIChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type AIChatRequest = {
  model: string;
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type AIChatResponse = {
  id: string;
  model: string;
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface AIProvider {
  readonly name: string;
  chat(request: AIChatRequest): Promise<AIChatResponse>;
}

const providerNameSchema = z.string().trim().min(1).max(100);

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    const name = providerNameSchema.parse(provider.name);
    this.providers.set(name, provider);
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    const lastUser = [...request.messages].reverse().find(message => message.role === "user");
    return {
      id: randomUUID(),
      model: request.model,
      content: `YnAiUdan AI gateway is connected. Provider "mock" received: ${lastUser?.content ?? ""}`
    };
  }
}

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(new MockProvider());

export function resolveProvider(model: string): AIProvider {
  const providerName = model.includes(":") ? model.split(":", 1)[0] : "mock";
  return providerRegistry.get(providerName) ?? providerRegistry.get("mock")!;
}
