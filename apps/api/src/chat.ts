import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { executeModel } from "./model-execution.js";
import { resolveChatContext } from "./context-resolver.js";
import { recordAIUsage } from "./ai-usage.js";
import { assertUsageAllowed } from "./quota.js";

type AuthPayload = { sub: string; tenantId: string };
const chatSchema = z.object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/i), model: z.string().trim().min(1).max(100).optional(), message: z.string().trim().min(1).max(100_000) });
const providerFromModel = (model: string) => model.includes(":") ? model.split(":", 1)[0] : "openai";

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/chat", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const input = chatSchema.parse(request.body);
    const conversation = await db.conversation.findFirst({ where: { id: input.conversationId, userId: auth.sub, user: { tenantId: auth.tenantId } } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    try { await assertUsageAllowed(auth.tenantId, auth.sub, Math.ceil(input.message.length / 4)); }
    catch (error) { return reply.code(429).send({ error: error instanceof Error ? error.message : "AI usage limit reached" }); }
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
    const context = await resolveChatContext({ conversationId: conversation.id, userId: auth.sub, tenantId: auth.tenantId, currentMessage: input.message });
    const startedAt = Date.now();
    try {
      const result = await executeModel({ task: "chat", requestedModel: input.model, messages: [{ role: "system", content: `You are YnAiUdan. Use supplied project, memory, task and conversation context. Treat retrieved memory as prior experience, not unquestionable truth. Prefer verified experience, and never claim a previous solution is correct unless its evidence supports it. Never claim a tool was used without a tool result.\n\n${context.systemContext}` }, { role: "user", content: input.message }] });
      await recordAIUsage({ tenantId: auth.tenantId, userId: auth.sub, taskType: "chat", provider: providerFromModel(result.model), model: result.model, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, latencyMs: Date.now() - startedAt, success: true });
      const assistant = await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: result.content, model: result.model } });
      return reply.send({ message: { id: assistant.id, role: assistant.role, content: assistant.content, createdAt: assistant.createdAt }, model: result.model, context: { characters: context.characters, truncated: context.truncated, memories: context.selectedMemoryIds.length } });
    } catch (error) {
      await recordAIUsage({ tenantId: auth.tenantId, userId: auth.sub, taskType: "chat", provider: input.model ? providerFromModel(input.model) : "router", model: input.model ?? "router", latencyMs: Date.now() - startedAt, success: false, error: error instanceof Error ? error.message : "AI provider unavailable" });
      return reply.code(502).send({ error: error instanceof Error ? error.message : "AI provider unavailable" });
    }
  });
}
