import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { getExecutionLedger, verifyExecutionLedger } from "./universal-execution-ledger.js";
import { getTaskArtifacts } from "./artifact-ledger.js";

type AuthPayload = { tenantId: string };

export async function registerUniversalEnterpriseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/universal/tasks/:id/evidence", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    try {
      const ledger = await getExecutionLedger(id, auth.tenantId);
      return reply.send({ ledger, integrity: verifyExecutionLedger(ledger) });
    } catch {
      return reply.code(404).send({ error: "Execution evidence not found" });
    }
  });

  app.get("/api/v1/universal/tasks/:id/artifacts", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const { id } = request.params as { id: string };
    try {
      const artifacts = await getTaskArtifacts(id, auth.tenantId);
      return reply.send({ artifacts, count: artifacts.length });
    } catch {
      return reply.code(404).send({ error: "Task artifacts not found" });
    }
  });
}
