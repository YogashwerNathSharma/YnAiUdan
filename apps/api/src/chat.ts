import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { executeModel } from "./model-execution.js";
import { resolveChatContext } from "./context-resolver.js";

type AuthPayload = { sub: string; tenantId: string };
const chatSchema = z.object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i), model: z.string().trim().min(1).max(100).optional(), message: z.string().trim().min(1).max(100_000) });

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const input = chatSchema.parse(request.body);
    const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
    const context = await resolveChatContext({ conversationId: conversation.id, userId: auth.sub, tenantId: auth.tenantId });
    try {
      const result = await executeModel({ task: "chat", requestedModel: input.model, messages: [{ role: "system", content: `You are YnAiUdan. Use supplied project, memory, task and conversation context. Never claim a tool was used without a tool result.\n\n${context.systemContext}` }, { role: "user", content: input.message }] });
      const assistant = await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: result.content, model: result.model } });
      return reply.send({ message: { id: assistant.id, role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }, model: result.model, context: { characters: context.characters, truncated: context.truncated, memories: context.selectedMemoryIds.length } });
    } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : "AI provider unavailable" }); }
  });
}
