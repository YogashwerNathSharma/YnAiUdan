import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { executeTool } from "./tool-executor.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const workspaceBase = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));
const pathSchema = z.string().min(1).max(1000).refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path");

function tenantRoot(tenantId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)) throw new Error("Invalid tenant id");
  return path.resolve(workspaceBase, tenantId);
}

function safePath(tenantId: string, relativePath: string): string {
  const parsed = pathSchema.parse(relativePath);
  const root = tenantRoot(tenantId);
  const resolved = path.resolve(root, parsed);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Workspace path escapes sandbox");
  return resolved;
}

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspace/tree", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const relative = (request.query as { path?: string }).path ?? "";
    try {
      const directory = relative ? safePath(auth.tenantId, relative) : tenantRoot(auth.tenantId);
      await fs.mkdir(directory, { recursive: true });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return { tenantId: auth.tenantId, path: relative, entries: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })) };
    } catch { return reply.code(400).send({ error: "Unable to read workspace" }); }
  });

  app.get("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const relative = (request.query as { path?: string }).path;
    if (!relative) return reply.code(400).send({ error: "path is required" });
    try { return { path: relative, content: await fs.readFile(safePath(auth.tenantId, relative), "utf8") }; }
    catch { return reply.code(404).send({ error: "File not found" }); }
  });

  app.post("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const body = z.object({ path: pathSchema, content: z.string().max(2_000_000), mode: z.string().default("ASK_BEFORE_TOOLS") }).parse(request.body);
    if (auth.role === "AGENT" && body.mode !== "AUTO_SAFE" && body.mode !== "SAFE_AUTO") return reply.code(403).send({ error: "Agent write requires AUTO_SAFE mode" });
    const result = await executeTool({ toolName: "workspace.write", input: body, tenantId: auth.tenantId, role: auth.role, mode: body.mode });
    if (!result.ok) return reply.code(result.requiresApproval ? 403 : 400).send(result);
    return reply.code(201).send(result);
  });
}

export async function writeWorkspaceFile(tenantId: string, relativePath: string, content: string): Promise<void> {
  const target = safePath(tenantId, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}
