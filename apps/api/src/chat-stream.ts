import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { resolveProvider, type AIChatMessage } from "./ai.js";
import { resolveChatContext } from "./context-resolver.js";

type AuthPayload = { sub: string; tenantId: string };
const schema = z.object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i), model: z.string().trim().min(1).max(100).default("mock:default"), message: z.string().trim().min(1).max(100_000) });

export async function registerChatStreamRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat/stream", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = schema.parse(request.body);
    const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
    const context = await resolveChatContext({ conversationId: conversation.id, userId: auth.sub, tenantId: auth.tenantId });
    const messages: AIChatMessage[] = [
      { role: "system", content: `You are YnAiUdan. Use the supplied project, memory, task and conversation context as background. Do not claim to have used a tool unless a tool result is present.\n\n${context.systemContext}` },
      { role: "user", content: input.message }
    ];
    const provider = resolveProvider(input.model);
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    let final = "";
    try {
      if (provider.stream) {
        for await (const event of provider.stream({ model: input.model, messages })) {
          if (event.type === "text") { final += event.text ?? ""; reply.raw.write(`data: ${JSON.stringify({ type: "text", text: event.text ?? "" })}\n\n`); }
        }
      } else {
        const result = await provider.chat({ model: input.model, messages });
        final = result.content;
        reply.raw.write(`data: ${JSON.stringify({ type: "text", text: final })}\n\n`);
      }
      const assistant = await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: final, model: input.model } });
      reply.raw.write(`data: ${JSON.stringify({ type: "done", messageId: assistant.id, provider: provider.name, model: input.model, context: { characters: context.characters, truncated: context.truncated, memories: context.selectedMemoryIds.length } })}\n\n`);
    } catch (error) {
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Streaming request failed" })}\n\n`);
    } finally { reply.raw.end(); }
  });
}
