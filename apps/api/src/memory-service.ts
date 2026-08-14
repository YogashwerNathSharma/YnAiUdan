import { db } from "./db.js";
import { cosineSimilarity, embedText } from "./memory-embedding.js";

export type MemoryContext = { userId: string; tenantId: string; projectId?: string; limit?: number };

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/).filter(word => word.length >= 3));
}

function lexicalScore(goal: string, memory: { key: string; value: string }): number {
  const goalTokens = tokens(goal);
  const textTokens = tokens(`${memory.key} ${memory.value}`);
  if (!goalTokens.size) return 0;
  let overlap = 0;
  for (const token of goalTokens) if (textTokens.has(token)) overlap++;
  return overlap / goalTokens.size;
}

function recencyScore(updatedAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - updatedAt.getTime()) / 86_400_000);
  return Math.exp(-ageDays / 30);
}

export async function retrieveRelevantMemories(goal: string, context: MemoryContext) {
  const limit = Math.min(context.limit ?? 8, 20);
  const queryEmbedding = await embedText(goal).catch(() => undefined);
  const memories = await db.memory.findMany({
    where: { tenantId: context.tenantId, userId: context.userId, OR: [{ projectId: context.projectId ?? undefined }, { projectId: null }] },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return memories
    .map(memory => {
      const lexical = lexicalScore(goal, memory);
      const semantic = queryEmbedding ? cosineSimilarity(queryEmbedding.vector, memory.embedding) : 0;
      const importance = Math.max(0, Math.min(1, memory.importance));
      const recency = recencyScore(memory.updatedAt);
      const projectBoost = memory.projectId === context.projectId ? 0.10 : 0;
      const score = semantic * 0.55 + lexical * 0.25 + importance * 0.15 + recency * 0.05 + projectBoost;
      return { memory, score, semantic, lexical };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);
}

export async function saveTaskMemory(input: { tenantId: string; userId: string; projectId?: string; taskId: string; key: string; value: string; importance?: number }) {
  const key = input.key.slice(0, 200);
  const value = input.value.slice(0, 10_000);
  const created = await db.memory.create({
    data: { tenantId: input.tenantId, userId: input.userId, projectId: input.projectId, type: "TASK", key, value, importance: Math.max(0, Math.min(1, input.importance ?? 0.7)) },
  });
  const embedding = await embedText(`${key}\n${value}`).catch(() => undefined);
  if (embedding) {
    return db.memory.update({ where: { id: created.id }, data: { embedding: embedding.vector, embeddingModel: embedding.model } });
  }
  return created;
}
