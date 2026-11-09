import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";
import { executeTool } from "./tool-executor.js";
import { resolveRoot, safeJoin } from "./workspace-root.js";

const commandSchema = z.object({ command: z.string().trim().min(1).max(2000), root: z.string().max(1000).optional(), mode: z.enum(["CONFIRM_TOOLS", "SAFE_AUTO", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") });

export function registerCodingTools(): void {
  if (toolRegistry.get("workspace.write")) return;
  toolRegistry.register({
    name: "workspace.write",
    description: "Write a UTF-8 file inside the chosen workspace folder.",
    inputSchema: z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000), root: z.string().max(1000).optional(), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]) }),
    risk: "MEDIUM",
    permissions: ["FILE_WRITE"],
    timeoutMs: 10_000,
    execute: async input => {
      const target = safeJoin(resolveRoot(input.root), input.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, input.content, "utf8");
      return { path: input.path, bytes: Buffer.byteLength(input.content, "utf8") };
    }
  });
}

export async function registerCodingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/coding/command", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as { tenantId: string; role: string };
    const input = commandSchema.parse(request.body);
    const result = await executeTool({ toolName: "terminal.execute", input: { command: input.command, root: input.root }, role: auth.role, mode: input.mode });
    return reply.status(result.ok ? 200 : result.requiresApproval ? 403 : 400).send(result);
  });
}
