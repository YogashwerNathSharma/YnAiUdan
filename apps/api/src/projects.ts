import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { isDbDisabled } from "./dev-auth-store.js";

type AuthPayload = { sub: string; tenantId: string; role: string };

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  instructions: z.string().trim().max(20_000).optional()
});

// In-memory projects for DB-free dev mode (lost on restart).
type DevProject = { id: string; name: string; slug: string; instructions: string | null; createdAt: string; updatedAt: string; userId: string };
const devProjects: DevProject[] = [];

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/projects", { preHandler: authenticate }, async (request) => {
    const auth = request.user as AuthPayload;
    if (isDbDisabled()) return devProjects.filter(p => p.userId === auth.sub).map(({ userId, ...rest }) => rest);
    return db.project.findMany({
      where: { tenantId: auth.tenantId, members: { some: { userId: auth.sub } } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, instructions: true, createdAt: true, updatedAt: true }
    });
  });

  app.post("/api/v1/projects", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = projectSchema.parse(request.body);
    const slugBase = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;

    if (isDbDisabled()) {
      const now = new Date().toISOString();
      const project: DevProject = { id: randomUUID().replace(/-/g, "").slice(0, 24), name: input.name, slug, instructions: input.instructions ?? null, createdAt: now, updatedAt: now, userId: auth.sub };
      devProjects.unshift(project);
      const { userId, ...rest } = project;
      return reply.code(201).send(rest);
    }

    const project = await db.project.create({
      data: {
        tenantId: auth.tenantId,
        name: input.name,
        slug,
        ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
        members: { create: { userId: auth.sub, role: "OWNER" } }
      },
      select: { id: true, name: true, slug: true, instructions: true, createdAt: true, updatedAt: true }
    });

    return reply.code(201).send(project);
  });
}
