import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { buildCiRepairPlan } from "./ci-repair-planner.js";

const schema = z.object({ jobs: z.array(z.object({ id: z.number(), name: z.string(), conclusion: z.string().nullable().optional(), status: z.string().nullable().optional(), steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable().optional(), status: z.string().nullable().optional(), number: z.number().optional() })).optional() })), log: z.string().max(500_000).optional() });

type AuthPayload = { tenantId: string; role: string };

export async function registerCiRepairRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/ci/repair-plan", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    const input = schema.parse(request.body);
    return reply.send({ tenantId: auth.tenantId, plan: buildCiRepairPlan(input) });
  });
}
