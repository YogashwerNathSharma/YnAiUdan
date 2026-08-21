import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { executeTool } from "./tool-executor.js";
import type { ToolExecutionContext } from "./tools.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const workspaceBase = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));
const pathSchema = z.string().max(1000).refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path");

function scopedRoot(context: Pick<ToolExecutionContext, "tenantId" | "userId">): string {
  if (!context.tenantId || !context.userId) throw new Error("Tenant and user context are required for workspace access");
  return path.join(workspaceBase, "tenants", context.tenantId, "users", context.userId);
}

function safePath(relativePath: string, context: Pick<ToolExecutionContext, "tenantId" | "userId">): string {
  const parsed = pathSchema.parse(relativePath);
  const root = scopedRoot(context);
  const resolved = path.resolve(root, parsed);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Workspace path escapes sandbox");
  return resolved;
}

export function workspaceRootFor(context: Pick<ToolExecutionContext, "tenantId" | "userId">): string { return scopedRoot(context); }

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspace/tree", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const relative = (request.query as { path?: string }).path ?? "";
    try {
      const context = { tenantId: auth.tenantId, userId: auth.sub };
      const directory = safePath(relative, context);
      await fs.mkdir(directory, { recursive: true });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      return { tenantId: auth.tenantId, userId: auth.sub, path: relative, entries: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })) };
    } catch { return reply.code(400).send({ error: "Unable to read workspace" }); }
  });

  app.get("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const relative = (request.query as { path?: string }).path;
    if (!relative) return reply.code(400).send({ error: "path is required" });
    try { return { path: relative, content: await fs.readFile(safePath(relative, { tenantId: auth.tenantId, userId: auth.sub }), "utf8") }; }
    catch { return reply.code(404).send({ error: "File not found" }); }
  });

  app.post("/api/v1/workspace/file", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const body = z.object({ path: pathSchema, content: z.string().max(2_000_000), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") }).parse(request.body);
    const result = await executeTool({ toolName: "workspace.write", input: body, role: auth.role, mode: body.mode, context: { tenantId: auth.tenantId, userId: auth.sub } });
    if (!result.ok) return reply.code(result.requiresApproval ? 403 : 400).send(result);
    return reply.code(201).send(result);
  });
}

export async function writeWorkspaceFile(relativePath: string, content: string, context: Pick<ToolExecutionContext, "tenantId" | "userId">): Promise<void> {
  const target = safePath(relativePath, context);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}
