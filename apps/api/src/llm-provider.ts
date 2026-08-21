export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
export type LlmGenerateRequest = { messages: LlmMessage[]; model?: string; temperature?: number; maxTokens?: number };
export type LlmGenerateResult = { text: string; model?: string; usage?: { inputTokens?: number; outputTokens?: number } };

export interface LlmProvider { generate(request: LlmGenerateRequest): Promise<LlmGenerateResult>; }

export class HttpLlmProvider implements LlmProvider {
  constructor(private readonly endpoint: string, private readonly apiKey?: string) {}
  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    const response = await fetch(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) }, body: JSON.stringify(request) });
    const data = await response.json().catch(() => null) as any;
    if (!response.ok) throw new Error(`LLM provider ${response.status}: ${data?.error?.message ?? "request failed"}`);
    if (typeof data?.text !== "string") throw new Error("LLM provider returned an invalid response");
    return { text: data.text, model: data.model, usage: data.usage };
  }
}
