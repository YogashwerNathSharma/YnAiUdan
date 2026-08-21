import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";
import { executeTool } from "./tool-executor.js";
import { writeWorkspaceFile, workspaceRootFor } from "./workspace.js";

type CodingContext = { tenantId: string; userId: string; projectId?: string };
const commandSchema = z.object({ command: z.string().trim().min(1).max(2000), mode: z.enum(["CONFIRM_TOOLS", "SAFE_AUTO", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") });
const relativePath = z.string().min(1).max(1000).refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path");

async function resolveFile(context: CodingContext, filePath: string): Promise<string> {
  const root = workspaceRootFor(context);
  const target = path.resolve(root, filePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Workspace path escapes sandbox");
  return target;
}

async function walk(root: string, current: string, output: string[], maxEntries: number): Promise<void> {
  if (output.length >= maxEntries) return;
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", ".next", ".cache"].includes(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    output.push(path.relative(root, absolute));
    if (entry.isDirectory()) await walk(root, absolute, output, maxEntries);
    if (output.length >= maxEntries) return;
  }
}

export function registerCodingTools(): void {
  if (!toolRegistry.get("workspace.write")) toolRegistry.register({
    name: "workspace.write", description: "Write a UTF-8 file inside the authenticated user's tenant workspace sandbox.",
    inputSchema: z.object({ path: relativePath, content: z.string().max(2_000_000), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]) }), risk: "MEDIUM", permissions: ["FILE_WRITE"], timeoutMs: 10_000,
    execute: async (input, context) => { if (!context?.tenantId || !context.userId) throw new Error("Tenant and user context are required"); await writeWorkspaceFile(input.path, input.content, context); return { path: input.path, bytes: Buffer.byteLength(input.content, "utf8") }; }
  });
  if (!toolRegistry.get("workspace.list")) toolRegistry.register({
    name: "workspace.list", description: "List files and directories in the authenticated user's workspace, excluding dependency/build directories.",
    inputSchema: z.object({ path: z.string().max(1000).default(""), maxEntries: z.number().int().min(1).max(500).default(200) }), risk: "LOW", permissions: ["FILE_READ"], timeoutMs: 10_000,
    execute: async (input, context) => { if (!context?.tenantId || !context.userId) throw new Error("Tenant and user context are required"); const root = workspaceRootFor(context); const start = input.path ? await resolveFile(context, input.path) : root; await fs.mkdir(start, { recursive: true }); const entries: string[] = []; await walk(root, start, entries, input.maxEntries); return { path: input.path || ".", entries, truncated: entries.length >= input.maxEntries }; }
  });
  if (!toolRegistry.get("workspace.read")) toolRegistry.register({
    name: "workspace.read", description: "Read a UTF-8 source/config file from the authenticated user's workspace.",
    inputSchema: z.object({ path: relativePath, maxCharacters: z.number().int().min(1).max(200_000).default(100_000) }), risk: "LOW", permissions: ["FILE_READ"], timeoutMs: 10_000,
    execute: async (input, context) => { if (!context?.tenantId || !context.userId) throw new Error("Tenant and user context are required"); const content = await fs.readFile(await resolveFile(context, input.path), "utf8"); return { path: input.path, content: content.slice(0, input.maxCharacters), truncated: content.length > input.maxCharacters }; }
  });
  if (!toolRegistry.get("workspace.search")) toolRegistry.register({
    name: "workspace.search", description: "Search text across source files in the authenticated user's workspace.",
    inputSchema: z.object({ query: z.string().min(1).max(500), path: z.string().max(1000).default(""), maxResults: z.number().int().min(1).max(200).default(50) }), risk: "LOW", permissions: ["FILE_READ"], timeoutMs: 20_000,
    execute: async (input, context) => { if (!context?.tenantId || !context.userId) throw new Error("Tenant and user context are required"); const root = workspaceRootFor(context); const start = input.path ? await resolveFile(context, input.path) : root; const files: string[] = []; await walk(root, start, files, 1000); const results: Array<{ path: string; line: number; text: string }> = []; for (const relative of files) { if (results.length >= input.maxResults) break; const candidate = path.join(root, relative); try { if (!(await fs.stat(candidate)).isFile()) continue; const text = await fs.readFile(candidate, "utf8"); text.split(/\r?\n/).forEach((line, index) => { if (results.length < input.maxResults && line.toLowerCase().includes(input.query.toLowerCase())) results.push({ path: relative, line: index + 1, text: line.slice(0, 1000) }); }); } catch { /* skip unreadable/binary files */ } } return { query: input.query, results, truncated: results.length >= input.maxResults }; }
  });
}

export async function registerCodingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/coding/command", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as { sub: string; tenantId: string; role: string };
    const input = commandSchema.parse(request.body);
    const result = await executeTool({ toolName: "terminal.execute", input, role: auth.role, mode: input.mode, context: { tenantId: auth.tenantId, userId: auth.sub } });
    return reply.status(result.ok ? 200 : result.requiresApproval ? 403 : 400).send(result);
  });
}
