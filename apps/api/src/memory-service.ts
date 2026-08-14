import { db } from "./db.js";

export type MemoryContext = { userId: string; tenantId: string; projectId?: string; limit?: number };

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s_-]/g, " ").split(/\s+/).filter(word => word.length >= 3));
}

export async function retrieveRelevantMemories(goal: string, context: MemoryContext) {
  const limit = Math.min(context.limit ?? 8, 20);
  const memories = await db.memory.findMany({
    where: {
      tenantId: context.tenantId,
      userId: context.userId,
      OR: [{ projectId: context.projectId ?? undefined }, { projectId: null }],
    },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 50,
  });
  const goalTokens = tokens(goal);
  return memories
    .map(memory => {
      const textTokens = tokens(`${memory.key} ${memory.value}`);
      let overlap = 0;
      for (const token of goalTokens) if (textTokens.has(token)) overlap++;
      const score = overlap * 2 + memory.importance + (memory.projectId === context.projectId ? 1 : 0);
      return { memory, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.memory);
}

export async function saveTaskMemory(input: { tenantId: string; userId: string; projectId?: string; taskId: string; key: string; value: string; importance?: number }) {
  return db.memory.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      projectId: input.projectId,
      type: "TASK",
      key: input.key.slice(0, 200),
      value: input.value.slice(0, 10000),
      importance: Math.max(0, Math.min(1, input.importance ?? 0.7)),
    },
  });
}
