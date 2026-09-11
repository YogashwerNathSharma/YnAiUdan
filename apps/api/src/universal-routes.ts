import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { buildUniversalPlan } from "./universal-intelligence.js";
import { verifyExecution } from "./verification-engine.js";

const planSchema = z.object({ goal: z.string().trim().min(1).max(20_000), platform: z.string().trim().max(100).default("GENERAL") });
const verifySchema = z.object({ expectedExitCode: z.number().int().default(0), exitCode: z.number().int(), stdout: z.string().max(200_000).optional(), stderr: z.string().max(200_000).optional(), requiredOutput: z.string().max(10_000).optional() });

export async function registerUniversalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/universal/plan", { preHandler: authenticate }, async request => {
    const input = planSchema.parse(request.body);
    return { status: "planned", plan: buildUniversalPlan(input.goal, input.platform) };
  });

  app.post("/api/v1/universal/verify", { preHandler: authenticate }, async request => {
    const input = verifySchema.parse(request.body);
    return { status: "verified", report: verifyExecution(input) };
  });
}
