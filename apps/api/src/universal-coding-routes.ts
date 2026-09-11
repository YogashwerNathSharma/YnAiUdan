import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { runUniversalCodingLoop } from "./universal-coding-loop.js";

type AuthPayload = { tenantId: string; role: string };

const schema = z.object({
  goal: z.string().trim().min(1).max(20_000),
  language: z.string().trim().max(100).optional(),
  workspaceContext: z.string().max(20_000).optional(),
  maxAttempts: z.number().int().min(1).max(3).default(3),
  mode: z.string().default("ASK_BEFORE_TOOLS"),
});

export async function registerUniversalCodingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/universal/code/run", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = schema.parse(request.body);
    const result = await runUniversalCodingLoop({ ...input, tenantId: auth.tenantId, role: auth.role });
    return reply.status(result.success ? 200 : 422).send({ status: result.success ? "verified" : "failed", result });
  });
}
