import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";
import { executeTool } from "./tool-executor.js";
import { writeWorkspaceFile } from "./workspace.js";

const commandSchema = z.object({ command: z.string().trim().min(1).max(2000), mode: z.enum(["CONFIRM_TOOLS", "SAFE_AUTO", "AUTONOMOUS", "FULLY_CONTROLLED"]).default("CONFIRM_TOOLS") });

export function registerCodingTools(): void {
  toolRegistry.register({
    name: "workspace.write",
    description: "Write a UTF-8 file inside the authenticated user's tenant workspace sandbox.",
    inputSchema: z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000), mode: z.enum(["SAFE_AUTO", "CONFIRM_TOOLS", "AUTONOMOUS", "FULLY_CONTROLLED"]) }),
    risk: "MEDIUM",
    permissions: ["FILE_WRITE"],
    timeoutMs: 10_000,
    execute: async (input, context) => {
      if (!context?.tenantId || !context.userId) throw new Error("Tenant and user context are required");
      await writeWorkspaceFile(input.path, input.content, { tenantId: context.tenantId, userId: context.userId });
      return { path: input.path, bytes: Buffer.byteLength(input.content, "utf8") };
    }
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
