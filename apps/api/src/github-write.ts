import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { githubRegistry } from "./github-agent.js";
import { githubWriteActionSchema, requiresApproval, validateBranchName } from "./github-write-policy.js";

type AuthPayload = { role: string };
const requestSchema = z.object({
  action: githubWriteActionSchema,
  owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
  branch: z.string().max(200).optional(),
  fromRef: z.string().max(200).optional(),
  approved: z.boolean().default(false)
});

export async function registerGitHubWriteRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/github/write/validate", { preHandler: authenticate }, async (request, reply) => {
    const input = requestSchema.parse(request.body);
    const auth = request.user as AuthPayload;
    if (!['OWNER', 'ADMIN', 'DEVELOPER'].includes(auth.role)) return reply.code(403).send({ error: "GitHub write requires developer permissions" });
    if (input.branch) validateBranchName(input.branch);
    const approvalRequired = requiresApproval(input.action, input.branch);
    if (approvalRequired && !input.approved) return reply.code(409).send({ approved: false, requiresApproval: true, action: input.action, message: "Explicit approval is required before this GitHub write action." });
    if (input.action !== "CREATE_BRANCH") return reply.send({ approved: true, action: input.action, executable: false, message: "Action is authorized by policy; concrete mutation executor will be added in the commit/PR phase." });
    try {
      const result = await githubRegistry.getClient().createBranch({ owner: input.owner, name: input.name }, input.branch!, input.fromRef);
      return reply.code(201).send({ approved: true, action: input.action, result });
    } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });
}
