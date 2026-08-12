import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import { registerAuthRoutes } from "./auth.js";
import { registerProjectRoutes } from "./projects.js";
import { registerConversationRoutes } from "./conversations.js";
import { registerChatRoutes } from "./chat.js";
import { db } from "./db.js";

const app = Fastify({ logger: true });
await app.register(helmet);
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true });
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET must be configured and at least 32 characters long");
await app.register(jwt, { secret: jwtSecret });

app.get("/health", async () => ({ status: "ok", service: "ynaiudan-api", version: "0.1.0" }));
app.get("/health/database", async (_request, reply) => { try { await db.$runCommandRaw({ ping: 1 }); return { status: "ok", service: "mongodb" }; } catch { return reply.code(503).send({ status: "unavailable", service: "mongodb" }); } });
app.get("/api/v1", async () => ({ name: "YnAiUdan API", version: "v1" }));
await registerAuthRoutes(app);
await registerProjectRoutes(app);
await registerConversationRoutes(app);
await registerChatRoutes(app);

const port = Number(process.env.PORT ?? 4000); const host = process.env.HOST ?? "0.0.0.0";
try { await app.listen({ port, host }); } catch (error) { app.log.error(error); await db.$disconnect(); process.exit(1); }
