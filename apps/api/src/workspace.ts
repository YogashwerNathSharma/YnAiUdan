import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { executeTool } from "./tool-executor.js";
import { resolveRoot, safeJoin, defaultRoot } from "./workspace-root.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const relPathSchema = z.string().min(1).max(1000).refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path");

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspace/tree", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const query = request.query as { path?: string; root?: string };
    const relative = query.path ?? "";
    try {
      const root = resolveRoot(query.root);
      const directory = safeJoin(root, relative);
      await fs.mkdir(directory, { recursive: true });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return { tenantId: auth.tenantId, path: relative, entries: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })) };
    } catch { return reply.code(400).send({ error: "Unable to read workspace" }); }
  });

  app.get("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const query = request.query as { path?: string; root?: string };
    if (!query.path) return reply.code(400).send({ error: "path is required" });
    try {
      const root = resolveRoot(query.root);
      return { path: query.path, content: await fs.readFile(safeJoin(root, query.path), "utf8") };
    } catch { return reply.code(404).send({ error: "File not found" }); }
  });

  app.post("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const body = z.object({ path: relPathSchema, content: z.string().max(2_000_000), root: z.string().max(1000).optional(), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") }).parse(request.body);
    if (auth.role === "AGENT" && body.mode !== "SAFE_AUTO" && body.mode !== "AUTONOMOUS") return reply.code(403).send({ error: "Agent write requires an allowed autonomy mode" });
    const result = await executeTool({ toolName: "workspace.write", input: body, role: auth.role, mode: body.mode });
    if (!result.ok) return reply.code(result.requiresApproval ? 403 : 400).send(result);
    return reply.code(201).send(result);
  });
}

export async function writeWorkspaceFile(relativePath: string, content: string, root?: string): Promise<void> {
  const target = safeJoin(resolveRoot(root), relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

export { defaultRoot };
