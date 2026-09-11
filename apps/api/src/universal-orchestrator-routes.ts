import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { autonomySchema } from "./permissions.js";
import { orchestrateUniversalGoal } from "./universal-orchestrator.js";

type AuthPayload = { sub: string; tenantId: string; role: string };

const schema = z.object({
  goal: z.string().trim().min(1).max(50_000),
  title: z.string().trim().max(200).optional(),
  projectId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  platform: z.string().trim().max(100).default("GENERAL"),
  model: z.string().trim().max(100).optional(),
  autonomyMode: autonomySchema.default("ASK_BEFORE_TOOLS"),
  approvalGranted: z.boolean().default(false),
  maxSteps: z.number().int().min(1).max(1000).default(50),
  maxToolCalls: z.number().int().min(1).max(5000).default(100),
  maxRetries: z.number().int().min(0).max(20).default(3),
  maxCycles: z.number().int().min(1).max(100).default(20),
});

export async function registerUniversalOrchestratorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/universal/orchestrate", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = schema.parse(request.body);
    try {
      const result = await orchestrateUniversalGoal({ ...input, userId: auth.sub, tenantId: auth.tenantId, role: auth.role });
      return reply.code(result.approvalRequired ? 202 : 201).send(result);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Universal orchestration failed" });
    }
  });
}
