import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";

type AuthPayload = { sub: string; tenantId: string };

const createConversationSchema = z.object({
  projectId: z.string().cuid().optional(),
  title: z.string().trim().min(1).max(200).optional()
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(100_000)
});

export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/conversations", { preHandler: authenticate }, async (request) => {
    const auth = request.user as AuthPayload;
    return db.conversation.findMany({
      where: { userId: auth.sub, user: { tenantId: auth.tenantId } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true, title: true, createdAt: true, updatedAt: true }
    });
  });

  app.post("/api/v1/conversations", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = createConversationSchema.parse(request.body);

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

    const conversation = await db.conversation.findFirst({
      where: { id, userId: auth.sub, user: { tenantId: auth.tenantId } },
      select: { id: true }
    });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    const message = await db.message.create({
      data: { conversationId: id, role: "USER", content: input.content },
      select: { id: true, role: true, content: true, createdAt: true }
    });

    return reply.code(201).send({ message, status: "accepted", assistant: "AI provider is not configured yet; the message has been stored safely." });
  });
}
