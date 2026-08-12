import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";

const app = Fastify({ logger: true });

await app.register(helmet);
await app.register(cors, { origin: true });

app.get("/health", async () => ({
  status: "ok",
  service: "ynaiudan-api",
  version: "0.1.0"
}));

app.get("/api/v1", async () => ({
  name: "YnAiUdan API",
  version: "v1"
}));

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
