import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { resolveProvider, type AIChatMessage } from "./ai.js";
import { executeNextTaskStep } from "./task-executor.js";
import type { FastifyInstance } from "fastify";

type AuthPayload = { sub: string; tenantId: string; role: string };
const createTaskSchema = z.object({ projectId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), title: z.string().trim().min(1).max(200), goal: z.string().trim().min(1).max(50_000), model: z.string().trim().min(1).max(100).default("mock:default"), maxSteps: z.number().int().min(1).max(1000).default(50), maxToolCalls: z.number().int().min(1).max(5000).default(100), maxRetries: z.number().int().min(0).max(20).default(3) });

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/agents/tasks", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const input = createTaskSchema.parse(request.body);
    if (input.projectId) { const project = await db.project.findFirst({ where: { id: input.projectId, tenantId: auth.tenantId, members: { some: { userId: auth.sub } } }, select: { id: true } }); if (!project) return reply.code(404).send({ error: "Project not found" }); }
    const task = await db.task.create({ data: { tenantId: auth.tenantId, userId: auth.sub, projectId: input.projectId, title: input.title, goal: input.goal, status: "PLANNING", maxSteps: input.maxSteps, maxToolCalls: input.maxToolCalls, maxRetries: input.maxRetries, steps: { create: { sequence: 1, name: "PLAN", status: "RUNNING", input: { goal: input.goal } } } }, include: { steps: true } });
    return reply.code(201).send(task);
  });
  app.get("/api/v1/agents/tasks", { preHandler: authenticate }, async request => { const auth = request.user as AuthPayload; return db.task.findMany({ where: { tenantId: auth.tenantId, userId: auth.sub }, orderBy: { createdAt: "desc" }, take: 100 }); });
  app.post("/api/v1/agents/tasks/:id/plan", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload; const { id } = request.params as { id: string }; const task = await db.task.findFirst({ where: { id, tenantId: auth.tenantId, userId: auth.sub }, include: { steps: { orderBy: { sequence: "asc" } } } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    const provider = resolveProvider("mock:default"); const messages: AIChatMessage[] = [{ role: "system", content: "You are the YnAiUdan planning engine. Create a concise, safe, ordered implementation plan. Do not execute tools. Return numbered steps only." }, { role: "user", content: task.goal }];
    const result = await provider.chat({ model: "mock:default", messages }); const lines = result.content.split(/\n|(?<=\.)\s+(?=\d+\.)/).map(line => line.trim()).filter(Boolean).slice(0, task.maxSteps ?? 50);
    await db.taskStep.deleteMany({ where: { taskId: task.id } }); await db.taskStep.createMany({ data: lines.map((line, index) => ({ taskId: task.id, sequence: index + 1, name: "PLAN", status: "PENDING" as const, input: { instruction: line } })) });
    const updated = await db.task.update({ where: { id: task.id }, data: { status: "WAITING_APPROVAL" }, include: { steps: { orderBy: { sequence: "asc" } } } }); return reply.send({ task: updated, planner: provider.name });
  });
  app.post("/api/v1/agents/tasks/:id/approve", { preHandler: authenticate }, async (request, reply) => { const auth = request.user as AuthPayload; const { id } = request.params as { id: string }; const task = await db.task.findFirst({ where: { id, tenantId: auth.tenantId, userId: auth.sub } }); if (!task) return reply.code(404).send({ error: "Task not found" }); const updated = await db.task.update({ where: { id }, data: { status: "RUNNING" } }); return reply.send({ task: updated, execution: "ready" }); });
  app.post("/api/v1/agents/tasks/:id/execute-next", { preHandler: authenticate }, async (request, reply) => { const auth = request.user as AuthPayload; const { id } = request.params as { id: string }; try { return reply.send(await executeNextTaskStep(id, auth.sub, auth.tenantId, auth.role)); } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Task execution failed" }); } });
}
export const taskExecutionId = (): string => randomUUID();
