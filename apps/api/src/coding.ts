import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";
import { executeTool } from "./tool-executor.js";
import { writeWorkspaceFile } from "./workspace.js";

const commandSchema = z.object({ command: z.string().trim().min(1).max(2000), mode: z.string().default("ASK_BEFORE_TOOLS") });

export function registerCodingTools(): void {
  if (toolRegistry.get("workspace.write")) return;
  toolRegistry.register({
    name: "workspace.write",
    description: "Write a UTF-8 file inside the tenant-isolated YnAiUdan workspace sandbox.",
    inputSchema: z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000), mode: z.string(), tenantId: z.string().min(1).max(128) }),
    risk: "MEDIUM",
    permissions: ["FILE_WRITE"],
    timeoutMs: 10_000,
    execute: async input => { await writeWorkspaceFile(input.tenantId, input.path, input.content); return { path: input.path, bytes: Buffer.byteLength(input.content, "utf8") }; }
  });
}

export async function registerCodingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/coding/command", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as { tenantId: string; role: string };
    const input = commandSchema.parse(request.body);
    const result = await executeTool({ toolName: "terminal.execute", input, tenantId: auth.tenantId, role: auth.role, mode: input.mode });
    return reply.status(result.ok ? 200 : result.requiresApproval ? 403 : 400).send(result);
  });
}
