import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { db } from "./db.js";
import { compileRequirements } from "./requirement-compiler.js";
import { createBuildOrchestrationPlan } from "./build-orchestrator.js";

type AuthPayload = { sub: string; tenantId: string; role: string };

const buildPlanSchema = z.object({
  projectId: z.string().min(1),
  requirements: z.array(z.string().trim().min(1).max(20_000)).min(1).max(200)
});

/**
 * Compiles a user's complete product requirements into a safe, inspectable
 * build plan. This is intentionally a planning endpoint: it does not mutate
 * source code, run arbitrary commands, or claim a build has succeeded.
 */
export async function registerBuildPlanRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/build/plan", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = buildPlanSchema.parse(request.body);

    const project = await db.project.findFirst({
      where: { id: input.projectId, tenantId: auth.tenantId, members: { some: { userId: auth.sub } } },
      select: { id: true, name: true }
    });

    if (!project) return reply.code(404).send({ error: "Project not found" });

    const compiled = compileRequirements(project.id, input.requirements);
    const orchestration = createBuildOrchestrationPlan(compiled);

    return {
      project,
      compiled,
      orchestration,
      execution: {
        status: "PLAN_ONLY",
        sourceMutation: false,
        deployment: false,
        message: orchestration.blockers.length
          ? "Resolve the listed discovery blockers before execution."
          : "Plan is ready for the execution pipeline."
      }
    };
  });
}
