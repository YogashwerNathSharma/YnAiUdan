import { db } from "./db.js";
import { buildContext, type ContextResult } from "./context.js";

export async function resolveChatContext(params: { conversationId: string; userId: string; tenantId: string; maxChars?: number; currentMessage?: string }): Promise<ContextResult> {
  const conversation = await db.conversation.findFirst({ where: { id: params.conversationId, userId: params.userId, user: { tenantId: params.tenantId } }, include: { messages: { orderBy: { createdAt: "desc" }, take: 100 }, project: true } });
  if (!conversation) throw new Error("Conversation not found");
  const memories = await db.memory.findMany({ where: { tenantId: params.tenantId, userId: params.userId, ...(conversation.projectId ? { projectId: conversation.projectId } : {}) }, orderBy: [{ importance: "desc" }, { updatedAt: "desc" }], take: 100 });
  const goal = params.currentMessage?.trim() || conversation.messages[0]?.content || "";
  const orderedMessages = [...conversation.messages].reverse();
  const newestId = conversation.messages[0]?.id;
  return buildContext({ project: conversation.project ? { name: conversation.project.name, instructions: conversation.project.instructions ?? undefined } : undefined, task: goal ? { goal, status: "CHAT" } : undefined, messages: orderedMessages.map((message, index) => ({ id: message.id, role: message.role.toLowerCase(), content: message.content, importance: message.id === newestId ? 1 : Math.max(0.5, 0.9 - index * 0.02) })), memories: memories.map(memory => ({ id: memory.id, key: memory.key, content: memory.value, importance: memory.importance })), maxChars: params.maxChars ?? 60_000 });
}
