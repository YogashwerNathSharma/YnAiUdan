import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { githubRegistry } from "./github-agent.js";
import { requiresApproval, githubWriteActionSchema } from "./github-write-policy.js";

type AuthPayload = { role: string };
const schema = z.object({ owner: z.string().min(1), name: z.string().min(1), action: githubWriteActionSchema, branch: z.string().max(200).optional(), approved: z.boolean().default(false) });

export async function registerGitHubActionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/github/action/check", { preHandler: authenticate }, async (request, reply) => {
    const input = schema.parse(request.body);
    const auth = request.user as AuthPayload;
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    const approval = requiresApproval(input.action, input.branch);
    if (approval && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", action: input.action });
    if (input.action !== "CREATE_PR" && input.action !== "MERGE") return reply.send({ status: "AUTHORIZED", action: input.action });
    return reply.send({ status: "AUTHORIZED", action: input.action, executable: false, message: "PR/Merge mutation adapter will execute only after repository-specific mutation payload validation." });
  });

  app.get("/api/v1/github/ci/:owner/:name/:sha", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ owner: z.string(), name: z.string(), sha: z.string().regex(/^[a-f0-9]{7,64}$/i) }).parse(request.params);
    try {
      const client = githubRegistry.getClient() as { getCommitStatus?: (repo: { owner: string; name: string }, sha: string) => Promise<unknown> };
      if (!client.getCommitStatus) return reply.code(501).send({ error: "CI status adapter not configured" });
      return reply.send(await client.getCommitStatus({ owner: params.owner, name: params.name }, params.sha));
    } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });
}
