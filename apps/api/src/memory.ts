import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { db } from "./db.js";

const memoryType = z.enum(["CONVERSATION", "USER", "PROJECT", "TASK", "TOOL", "PREFERENCE"]);
const memorySchema = z.object({ projectId: z.string().optional(), type: memoryType, key: z.string().min(1).max(200), value: z.string().min(1).max(20_000), importance: z.number().min(0).max(1).default(0.5) });

export async function registerMemoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/memory", { preHandler: authenticate }, async request => {
    const user = request.user as { sub: string; tenantId: string };
    const query = z.object({ projectId: z.string().optional(), type: memoryType.optional(), q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const rows = await db.memory.findMany({ where: { tenantId: user.tenantId, userId: user.sub, ...(query.projectId ? { projectId: query.projectId } : {}), ...(query.type ? { type: query.type } : {}) }, orderBy: { updatedAt: "desc" }, take: query.limit });
    const filtered = query.q ? rows.filter(row => `${row.key} ${row.value}`.toLowerCase().includes(query.q!.toLowerCase())) : rows;
    return { items: filtered };
  });

  app.post("/api/v1/memory", { preHandler: authenticate }, async request => {
    const user = request.user as { sub: string; tenantId: string };
    const input = memorySchema.parse(request.body);
    const row = await db.memory.create({ data: { tenantId: user.tenantId, userId: user.sub, ...input } });
    return row;
  });

  app.delete("/api/v1/memory/:id", { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { sub: string; tenantId: string };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const existing = await db.memory.findFirst({ where: { id, tenantId: user.tenantId, userId: user.sub } });
    if (!existing) return reply.code(404).send({ error: "Memory not found" });
    await db.memory.delete({ where: { id } });
    return { deleted: true, id };
  });
}
