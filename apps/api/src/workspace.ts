import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { executeTool } from "./tool-executor.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));
const pathSchema = z.string().min(1).max(1000).refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path");

function safePath(relativePath: string): string {
  const parsed = pathSchema.parse(relativePath);
  const resolved = path.resolve(workspaceRoot, parsed);
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) throw new Error("Workspace path escapes sandbox");
  return resolved;
}

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspace/tree", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const relative = (request.query as { path?: string }).path ?? "";
    try {
      const directory = safePath(relative);
      await fs.mkdir(directory, { recursive: true });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return { tenantId: auth.tenantId, path: relative, entries: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })) };
    } catch { return reply.code(400).send({ error: "Unable to read workspace" }); }
  });

  app.get("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const relative = (request.query as { path?: string }).path;
    if (!relative) return reply.code(400).send({ error: "path is required" });
    try { return { path: relative, content: await fs.readFile(safePath(relative), "utf8") }; }
    catch { return reply.code(404).send({ error: "File not found" }); }
  });

  app.post("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const body = z.object({ path: pathSchema, content: z.string().max(2_000_000), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") }).parse(request.body);
    if (auth.role === "AGENT" && body.mode !== "SAFE_AUTO" && body.mode !== "AUTONOMOUS") return reply.code(403).send({ error: "Agent write requires an allowed autonomy mode" });
    const result = await executeTool({ toolName: "workspace.write", input: body, role: auth.role, mode: body.mode });
    if (!result.ok) return reply.code(result.requiresApproval ? 403 : 400).send(result);
    return reply.code(201).send(result);
  });
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  const target = safePath(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}
