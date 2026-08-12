import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";

const registerSchema = z.object({
  tenantName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128)
});

type AuthPayload = { sub: string; tenantId: string; role: string };

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const email = input.email.toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "Email already registered" });

    const baseSlug = input.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant";
    const slug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(input.password, 12);

    const created = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.tenantName, slug } });
      return tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          passwordHash,
          displayName: input.name,
          role: "OWNER"
        },
        select: { id: true, tenantId: true, email: true, displayName: true, role: true }
      });
    });

    const token = await reply.jwtSign({ sub: created.id, tenantId: created.tenantId, role: created.role });
    return reply.code(201).send({ user: created, token });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = await reply.jwtSign({ sub: user.id, tenantId: user.tenantId, role: user.role });
    return reply.send({
      user: { id: user.id, tenantId: user.tenantId, email: user.email, displayName: user.displayName, role: user.role },
      token
    });
  });

  app.get("/api/v1/auth/me", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const user = await db.user.findUnique({
      where: { id: auth.sub },
      select: { id: true, tenantId: true, email: true, displayName: true, role: true }
    });
    if (!user) return reply.code(401).send({ error: "Unauthorized" });
    return reply.send({ user });
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}
