import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { githubRegistry } from "./github-agent.js";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

type AuthPayload = { role: string };
const schema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), branch: z.string().max(200), message: z.string().min(1).max(500), changes: z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100), approved: z.boolean().default(false), push: z.boolean().default(false) });

export async function registerGitHubExecutionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/github/coding/execute", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = schema.parse(request.body);
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    validateBranchName(input.branch);
    if (requiresApproval(input.push ? "PUSH" : "COMMIT", input.branch) && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: input.push ? "PUSH" : "COMMIT", branch: input.branch, files: input.changes.map(c => c.path) });
    try {
      const client = githubRegistry.getClient();
      const result = input.push ? await client.push(input, input.branch, input.message, input.changes) : await client.commitChanges(input, input.branch, input.message, input.changes);
      return reply.send({ status: "COMPLETED", result });
    } catch (error) { return reply.code(503).send({ status: "FAILED", error: error instanceof Error ? error.message : "GitHub execution failed" }); }
  });

  app.post("/api/v1/github/coding/pr", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = z.object({ owner: z.string(), name: z.string(), title: z.string().min(1).max(300), head: z.string().min(1).max(200), base: z.string().min(1).max(200), body: z.string().max(20_000).optional(), approved: z.boolean().default(false) }).parse(request.body);
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    if (!input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: "CREATE_PR" });
    try { return reply.code(201).send({ status: "COMPLETED", result: await githubRegistry.getClient().createPullRequest(input, input.title, input.head, input.base, input.body) }); }
    catch (error) { return reply.code(503).send({ status: "FAILED", error: error instanceof Error ? error.message : "PR creation failed" }); }
  });
}
