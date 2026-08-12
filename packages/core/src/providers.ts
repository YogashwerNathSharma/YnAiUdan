export type ProviderCapability =
  | "chat"
  | "reasoning"
  | "code"
  | "image"
  | "video"
  | "embedding"
  | "speech";

export interface AIProvider {
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export interface ChatRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  provider: string;
  model: string;
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelRoute {
  task: "chat" | "reasoning" | "coding" | "document";
  provider: string;
  model: string;
}
