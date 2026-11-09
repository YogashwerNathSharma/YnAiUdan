import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { isDbDisabled } from "./dev-auth-store.js";
import { devConversationStore } from "./dev-conversation-store.js";

type AuthPayload = { sub: string; tenantId: string };

const createConversationSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().trim().min(1).max(200).optional()
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  role: z.enum(["USER", "ASSISTANT"]).optional()
});

const summarize = (c: { id: string; projectId: string | null; title: string; createdAt: string; updatedAt: string }) =>
  ({ id: c.id, projectId: c.projectId, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt });

export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/conversations", { preHandler: authenticate }, async (request) => {
    const auth = request.user as AuthPayload;
    if (isDbDisabled()) return devConversationStore.listForUser(auth.sub).map(summarize);
    return db.conversation.findMany({
      where: { userId: auth.sub, user: { tenantId: auth.tenantId } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, title: true, createdAt: true, updatedAt: true }
    });
  });

  app.post("/api/v1/conversations", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = createConversationSchema.parse(request.body);

    if (isDbDisabled()) {
      const conversation = devConversationStore.create(auth.sub, input.projectId ?? null, input.title ?? "New conversation");
      return reply.code(201).send(summarize(conversation));
    }

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: { id: input.projectId, tenantId: auth.tenantId, members: { some: { userId: auth.sub } } },
        select: { id: true }
      });
      if (!project) return reply.code(404).send({ error: "Project not found" });
    }

    const conversation = await db.conversation.create({
      data: { userId: auth.sub, projectId: input.projectId, title: input.title ?? "New conversation" },
      select: { id: true, projectId: true, title: true, createdAt: true, updatedAt: true }
    });
    return reply.code(201).send(conversation);
  });

  app.get("/api/v1/conversations/:id", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };

    if (isDbDisabled()) {
      const conversation = devConversationStore.find(id, auth.sub);
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      return reply.send(conversation);
    }

    const conversation = await db.conversation.findFirst({
      where: { id, userId: auth.sub, user: { tenantId: auth.tenantId } },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    return reply.send(conversation);
  });

  app.post("/api/v1/conversations/:id/messages", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    const input = messageSchema.parse(request.body);

    if (isDbDisabled()) {
      const message = devConversationStore.addMessage(id, auth.sub, input.role ?? "USER", input.content);
      if (!message) return reply.code(404).send({ error: "Conversation not found" });
      return reply.code(201).send({ message, status: "accepted", assistant: "AI provider is not configured yet; the message has been stored in memory." });
    }

    const conversation = await db.conversation.findFirst({
      where: { id, userId: auth.sub, user: { tenantId: auth.tenantId } },
      select: { id: true }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    const message = await db.message.create({
      data: { conversationId: id, role: input.role ?? "USER", content: input.content },
      select: { id: true, role: true, content: true, createdAt: true }
    });

    return reply.code(201).send({ message, status: "accepted", assistant: "AI provider is not configured yet; the message has been stored safely." });
  });

  app.patch("/api/v1/conversations/:id", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    const input = z.object({
      title: z.string().trim().min(1).max(200).optional(),
      projectId: z.string().nullable().optional()
    }).parse(request.body);

    if (isDbDisabled()) {
      const conversation = devConversationStore.find(id, auth.sub);
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (input.title !== undefined) conversation.title = input.title;
      if (input.projectId !== undefined) conversation.projectId = input.projectId;
      conversation.updatedAt = new Date().toISOString();
      return reply.send(summarize(conversation));
    }

    const conversation = await db.conversation.findFirst({
      where: { id, userId: auth.sub, user: { tenantId: auth.tenantId } },
      select: { id: true }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: { id: input.projectId, tenantId: auth.tenantId, members: { some: { userId: auth.sub } } },
        select: { id: true }
      });
      if (!project) return reply.code(404).send({ error: "Project not found" });
    }

    const data: { title?: string; projectId?: string | null } = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.projectId !== undefined) data.projectId = input.projectId;

    const updated = await db.conversation.update({
      where: { id },
      data,
      select: { id: true, projectId: true, title: true, createdAt: true, updatedAt: true }
    });
    return reply.send(updated);
  });

  app.delete("/api/v1/conversations/:id", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };

    if (isDbDisabled()) {
      if (!devConversationStore.remove(id, auth.sub)) return reply.code(404).send({ error: "Conversation not found" });
      return reply.code(204).send();
    }

    const conversation = await db.conversation.findFirst({
      where: { id, userId: auth.sub, user: { tenantId: auth.tenantId } },
      select: { id: true }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    await db.message.deleteMany({ where: { conversationId: id } });
    await db.conversation.delete({ where: { id } });
    return reply.code(204).send();
  });
}
