import OpenAI from "openai";

const model = process.env.AI_EMBEDDING_MODEL?.replace(/^openai:/, "") || "text-embedding-3-small";
let client: OpenAI | undefined;

function getClient(): OpenAI | undefined {
  if (!process.env.OPENAI_API_KEY) return undefined;
  return client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
}

export async function embedText(text: string): Promise<{ vector: number[]; model: string } | undefined> {
  const openai = getClient();
  if (!openai || !text.trim()) return undefined;
  const response = await openai.embeddings.create({ model, input: text.slice(0, 20_000) });
  const vector = response.data[0]?.embedding;
  return vector ? { vector, model } : undefined;
}

export function cosineSimilarity(a: unknown, b: unknown): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]); const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y; aa += x * x; bb += y * y;
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}
