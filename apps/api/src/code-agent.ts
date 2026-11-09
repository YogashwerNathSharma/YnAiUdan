import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { db } from "./db.js";
import { executeTool } from "./tool-executor.js";
import { resolveRoot, safeJoin } from "./workspace-root.js";
import { writeWorkspaceFile } from "./workspace.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const inspectSchema = z.object({ path: z.string().max(1000).default("").refine(p => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."), "Invalid workspace path"), root: z.string().max(1000).optional(), maxEntries: z.number().int().min(1).max(500).default(200) });
const editSchema = z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000), root: z.string().max(1000).optional(), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") });

async function inspectDirectory(root: string, relative: string, maxEntries: number) {
  const output: Array<{ path: string; type: "file" | "directory" }> = [];
  const ignored = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);
  async function walk(current: string) {
    if (output.length >= maxEntries) return;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name) || output.length >= maxEntries) continue;
      const absolute = path.join(current, entry.name);
      const rel = path.relative(root, absolute);
      output.push({ path: rel, type: entry.isDirectory() ? "directory" : "file" });
      if (entry.isDirectory()) await walk(absolute);
    }
  }
  // Reject absolute paths and `..` traversal so a request cannot escape the
  // chosen workspace root (consistent with workspace.ts / code-fix-agent.ts).
  await walk(safeJoin(root, relative));
  return output;
}

export async function registerCodeAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/coding/inspect", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = inspectSchema.parse(request.body);
    const root = resolveRoot(input.root);
    try {
      await fs.mkdir(root, { recursive: true });
      const files = await inspectDirectory(root, input.path, input.maxEntries);
      return { root: input.root || root, files, truncated: files.length >= input.maxEntries };
    } catch { return reply.code(400).send({ error: "Unable to inspect workspace" }); }
  });

  app.post("/api/v1/coding/browse", { preHandler: authenticate }, async (request, reply) => {
    const { path: dir } = z.object({ path: z.string().max(1000).optional() }).parse(request.body ?? {});
    try {
      // Empty path -> list drive roots (Windows) or "/" (POSIX), plus the home dir.
      if (!dir) {
        const isWin = process.platform === "win32";
        const roots: Array<{ name: string; path: string }> = [];
        if (isWin) {
          for (let c = 65; c <= 90; c += 1) {
            const drive = `${String.fromCharCode(c)}:\\`;
            if (existsSync(drive)) roots.push({ name: drive, path: drive });
          }
        } else {
          roots.push({ name: "/", path: "/" });
        }
        return { path: "", parent: null, home: os.homedir(), directories: roots };
      }
      const abs = path.resolve(dir);
      const entries = await fs.readdir(abs, { withFileTypes: true });
      const directories = entries
        .filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
        .map(e => ({ name: e.name, path: path.join(abs, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const parent = path.dirname(abs);
      return { path: abs, parent: parent === abs ? null : parent, home: os.homedir(), directories };
    } catch {
      return reply.code(400).send({ error: "Unable to browse folder" });
    }
  });

  app.post("/api/v1/coding/edit", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = editSchema.parse(request.body);
    const result = await executeTool({ toolName: "workspace.write", input, tenantId: auth.tenantId, role: auth.role, mode: input.mode });
    return reply.status(result.ok ? 200 : result.requiresApproval ? 403 : 400).send(result);
  });

  app.post("/api/v1/coding/tasks/:id/run-step", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    const task = await db.task.findFirst({ where: { id, tenantId: auth.tenantId, userId: auth.sub }, include: { steps: { orderBy: { stepNumber: "asc" } } } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    if (task.status !== "RUNNING") return reply.code(409).send({ error: "Task must be RUNNING before execution" });
    const next = task.steps.find(step => step.status === "PENDING");
    if (!next) return reply.send({ status: "complete", taskId: task.id });
    if ((next.stepNumber ?? 0) > (task.maxSteps ?? Number.MAX_SAFE_INTEGER)) return reply.code(409).send({ error: "Task step limit reached" });
    await db.taskStep.update({ where: { id: next.id }, data: { status: "RUNNING", startedAt: new Date() } });
    const updated = await db.taskStep.update({ where: { id: next.id }, data: { status: "COMPLETED", completedAt: new Date(), output: { note: "Step execution boundary is ready; concrete tool selection is required before side effects." } } });
    return reply.send({ taskId: task.id, step: updated, nextAction: "select_tool" });
  });
}

export { writeWorkspaceFile };
