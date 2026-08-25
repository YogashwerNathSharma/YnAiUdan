import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { findLearning, markLearningOutcome, recordLearning } from "./learning-service.js";

type AuthPayload = { sub: string; tenantId: string };
const kind = z.enum(["SOLUTION", "CORRECTION", "MISTAKE", "PATTERN", "PREFERENCE"]);

export async function registerLearningRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/learning/search", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    const query = z.object({ q: z.string().trim().min(1).max(10000), projectId: z.string().optional(), limit: z.coerce.number().int().min(1).max(10).default(5) }).parse(request.query);
    return { items: await findLearning(query.q, { tenantId: auth.tenantId, userId: auth.sub, projectId: query.projectId, limit: query.limit }) };
  });

  app.post("/api/v1/learning", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    const input = z.object({ projectId: z.string().optional(), query: z.string().min(1).max(10000), kind, solution: z.string().max(20000).optional(), mistake: z.string().max(10000).optional(), rootCause: z.string().max(10000).optional(), correction: z.string().max(20000).optional(), verification: z.string().max(10000).optional(), confidence: z.number().min(0).max(1).optional(), verified: z.boolean().default(false) }).parse(request.body);
    return recordLearning({ tenantId: auth.tenantId, userId: auth.sub, ...input });
  });

  app.post("/api/v1/learning/:id/outcome", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({ success: z.boolean(), verification: z.string().max(10000).optional() }).parse(request.body);
    try { return await markLearningOutcome({ id, tenantId: auth.tenantId, userId: auth.sub, ...input }); }
    catch { return reply.code(404).send({ error: "Learning record not found" }); }
  });
}
