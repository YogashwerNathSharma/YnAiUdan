import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { githubRegistry } from "./github-agent.js";
import { executeTool } from "./tool-executor.js";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
const repoSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().max(200).optional() });
const inspectSchema = repoSchema.extend({ ref: z.string().max(200).optional(), paths: z.array(z.string().min(1).max(500)).max(50).default([]) });
const changeSchema = repoSchema.extend({ branch: z.string().max(200), changes: z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100), commitMessage: z.string().min(1).max(200), approved: z.boolean().default(false) });

export async function registerGitHubCodingAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/github/coding/inspect", { preHandler: authenticate }, async (request, reply) => {
    const input = inspectSchema.parse(request.body);
    try {
      const client = githubRegistry.getClient();
      const repository = await client.getRepository(input);
      const branches = await client.listBranches(input);
      const files = [];
      for (const filePath of input.paths) files.push({ path: filePath, content: await client.getFile(input, filePath, input.ref ?? input.defaultBranch) });
      return reply.send({ repository, branches, files });
    } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub inspection failed" }); }
  });

  app.post("/api/v1/github/coding/change", { preHandler: authenticate }, async (request, reply) => {
    const auth = request.user as AuthPayload;
    const input = changeSchema.parse(request.body);
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "Developer permission required" });
    validateBranchName(input.branch);
    if (requiresApproval("COMMIT", input.branch) && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, files: input.changes.map(change => change.path) });
    const result = await executeTool({ toolName: "github.commit", input, role: auth.role, mode: "FULLY_CONTROLLED" });
    return reply.status(result.ok ? 200 : 400).send(result);
  });
}
