import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { getExecutionLedger, verifyExecutionLedger } from "./universal-execution-ledger.js";

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
}
