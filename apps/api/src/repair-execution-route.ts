import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { executeApprovedRepair, validateRepairExecution, repairAttemptAllowed } from "./repair-execution.js";

const schema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), base: z.string().min(1).max(200), branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes: z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100), approved: z.boolean().default(false), push: z.boolean().default(false), attempts: z.number().int().min(0).max(3).default(0) });
type AuthPayload = { tenantId: string; role: string };

export async function registerRepairExecutionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/ci/repair-execute", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    const input = schema.parse(request.body);
    if (!repairAttemptAllowed(input.attempts)) return reply.code(409).send({ status: "STOPPED", reason: "MAX_REPAIR_ATTEMPTS_REACHED", maxAttempts: 3 });
    try {
      const policy = validateRepairExecution(input);
      if (policy.needsApproval && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: policy.action, branch: input.branch, base: input.base, files: input.changes.map(change => change.path), tenantId: auth.tenantId });
      const result = await executeApprovedRepair(input);
      return reply.status(result.status === "COMPLETED" ? 200 : 409).send({ ...result, tenantId: auth.tenantId });
    } catch (error) { return reply.code(400).send({ status: "FAILED", error: error instanceof Error ? error.message : "Repair execution failed" }); }
  });
}
