import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { resolveProvider, type AIChatMessage } from "./ai.js";

type AuthPayload = { sub: string; tenantId: string };

const chatSchema = z.object({
  conversationId: z.string().regex(/^[a-f0-9]{24}$/i),
  model: z.string().trim().min(1).max(100).default("mock:default"),
  message: z.string().trim().min(1).max(100_000)
});

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = chatSchema.parse(request.body);

    const conversation = await db.conversation.findFirst({
      where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });

    const history: AIChatMessage[] = conversation.messages.map(message => ({
      role: message.role.toLowerCase() as AIChatMessage["role"],
      content: message.content
    }));
    history.push({ role: "user", content: input.message });

    const provider = resolveProvider(input.model);
    const result = await provider.chat({ model: input.model, messages: history });
    const assistant = await db.message.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: result.content, model: result.model }
    });

    return reply.send({
      message: { id: assistant.id, role: assistant.role, content: assistant.content, createdAt: assistant.createdAt },
      provider: provider.name,
      model: result.model
    });
  });
}
