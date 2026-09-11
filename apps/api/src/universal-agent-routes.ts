import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { db } from "./db.js";
import { buildUniversalPlan } from "./universal-intelligence.js";
import { buildFederationPlan, materializeAgentEnvelopes } from "./universal-agent-federation.js";

type AuthPayload = { userId: string; tenantId: string; role: string };
const planSchema = z.object({ goal: z.string().trim().min(1).max(20_000), platform: z.string().trim().max(80).default("GENERAL"), maxParallelAgents: z.number().int().min(1).max(16).default(4) });

export async function registerUniversalAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/universal/agents/plan", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = planSchema.parse(request.body);
    const universalPlan = buildUniversalPlan(input.goal, input.platform);
    const federation = buildFederationPlan("preview", auth.tenantId, input.goal, universalPlan, input.maxParallelAgents);
    return reply.send({ federation, universalPlan });
  });

  app.get("/api/v1/universal/tasks/:id/agents", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    const task = await db.task.findFirst({ where: { id, tenantId: auth.tenantId, userId: auth.userId }, select: { id: true, goal: true } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    const universalPlan = buildUniversalPlan(task.goal);
    const federation = buildFederationPlan(task.id, auth.tenantId, task.goal, universalPlan);
    const envelopes = federation.waves.flatMap(wave => materializeAgentEnvelopes({ taskId: task.id, tenantId: auth.tenantId, goal: task.goal, wave }));
    return reply.send({ federation, envelopes });
  });
}
