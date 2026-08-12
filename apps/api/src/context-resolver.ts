import { db } from "./db.js";
import { buildContext, type ContextResult } from "./context.js";

export async function resolveChatContext(params: { conversationId: string; userId: string; tenantId: string; maxChars?: number }): Promise<ContextResult> {
  const conversation = await db.conversation.findFirst({
    where: { id: params.conversationId, userId: params.userId, user: { tenantId: params.tenantId } },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 100 },
      project: true
    }
  });
  if (!conversation) throw new Error("Conversation not found");

  const memories = await db.memory.findMany({
    where: { tenantId: params.tenantId, userId: params.userId, ...(conversation.projectId ? { projectId: conversation.projectId } : {}) },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 100
  });

  return buildContext({
    project: conversation.project ? { name: conversation.project.name, instructions: conversation.project.instructions ?? undefined } : undefined,
    messages: conversation.messages.reverse().map(message => ({ id: message.id, role: message.role.toLowerCase(), content: message.content, importance: 0.5 })),
    memories: memories.map(memory => ({ id: memory.id, key: memory.key, content: memory.value, importance: memory.importance })),
    maxChars: params.maxChars ?? 60_000
  });
}
