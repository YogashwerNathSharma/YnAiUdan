import { providerRegistry, resolveProvider, type AIProvider } from "./ai.js";

export type ModelTask = "chat" | "reasoning" | "coding" | "image" | "video" | "document" | "embedding" | "speech";

const configured = (key: string): string | undefined => process.env[key]?.trim() || undefined;

const defaults: Record<ModelTask, string> = {
  chat: process.env.AI_DEFAULT_MODEL ?? "openai:gpt-5-mini",
  reasoning: process.env.AI_REASONING_MODEL ?? "openai:gpt-5",
  coding: process.env.AI_CODING_MODEL ?? "openai:gpt-5",
  image: process.env.AI_IMAGE_MODEL ?? "image:default",
  video: process.env.AI_VIDEO_MODEL ?? "video:default",
  document: process.env.AI_DOCUMENT_MODEL ?? "openai:gpt-5-mini",
  embedding: process.env.AI_EMBEDDING_MODEL ?? "embedding:default",
  speech: process.env.AI_SPEECH_MODEL ?? "speech:default"
};

export function routeModel(task: ModelTask, requestedModel?: string): string {
  return requestedModel?.trim() || defaults[task];
}

export function routeProvider(model: string): AIProvider {
  return resolveProvider(model);
}

export function providerAvailable(model: string): boolean {
  const provider = model.includes(":") ? model.split(":", 1)[0] : "openai";
  return Boolean(providerRegistry.get(provider));
}

export function modelRouterInfo() {
  return {
    providers: providerRegistry.list(),
    defaults: Object.fromEntries(Object.keys(defaults).map(task => [task, defaults[task as ModelTask]])),
    fallbackModel: configured("AI_FALLBACK_MODEL") ?? "mock:default"
  };
}
