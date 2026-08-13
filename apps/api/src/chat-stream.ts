import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { executeModelStream } from "./model-stream-execution.js";
import { resolveChatContext } from "./context-resolver.js";

type AuthPayload = { sub: string; tenantId: string };
const schema = z.object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i), model: z.string().trim().min(1).max(100).optional(), message: z.string().trim().min(1).max(100_000) });

export async function registerChatStreamRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat/stream", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const input = schema.parse(request.body);
    const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
    const context = await resolveChatContext({ conversationId: conversation.id, userId: auth.sub, tenantId: auth.tenantId });
    const messages = [{ role: "system" as const, content: `You are YnAiUdan. Use supplied project, memory, task and conversation context. Never claim a tool was used without a tool result.\n\n${context.systemContext}` }, { role: "user" as const, content: input.message }];
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    let final = ""; let providerModel = input.model;
    try {
      for await (const event of executeModelStream({ task: "chat", requestedModel: input.model, messages })) {
        if (event.type === "text") { final += event.text ?? ""; reply.raw.write(`data: ${JSON.stringify({ type: "text", text: event.text ?? "" })}\n\n`); }
        if (event.type === "done" && event.response) { providerModel = event.response.model; }
      }
      const assistant = await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: final, model: providerModel } });
      reply.raw.write(`data: ${JSON.stringify({ type: "done", messageId: assistant.id, model: providerModel, context: { characters: context.characters, truncated: context.truncated, memories: context.selectedMemoryIds.length } })}\n\n`);
    } catch (error) { reply.raw.write(`data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Streaming request failed" })}\n\n`); }
    finally { reply.raw.end(); }
  });
}
