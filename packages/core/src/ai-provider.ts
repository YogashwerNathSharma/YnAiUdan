export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatResponse = {
  id: string;
  model: string;
  content: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface AIProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }
}
