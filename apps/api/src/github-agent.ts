import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { requiresApproval, validateBranchName } from "./github-write-policy.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
export type GitHubRepository = { owner: string; name: string; defaultBranch?: string };
export type GitHubFileChange = { path: string; content: string };
export type GitHubClient = {
  getRepository(repository: GitHubRepository): Promise<unknown>;
  listBranches(repository: GitHubRepository): Promise<unknown[]>;
  getFile(repository: GitHubRepository, path: string, ref?: string): Promise<unknown>;
  createBranch(repository: GitHubRepository, branch: string, fromRef?: string): Promise<unknown>;
  commitChanges(repository: GitHubRepository, branch: string, message: string, changes: GitHubFileChange[]): Promise<unknown>;
  push(repository: GitHubRepository, branch: string, message: string, changes: GitHubFileChange[]): Promise<unknown>;
  createPullRequest(repository: GitHubRepository, title: string, head: string, base: string, body?: string): Promise<unknown>;
  getCommitStatus?(repository: GitHubRepository, sha: string): Promise<unknown>;
};

export class GitHubProviderRegistry {
  private client?: GitHubClient;
  setClient(client: GitHubClient): void { this.client = client; }
  getClient(): GitHubClient { if (!this.client) throw new Error("GitHub integration is not configured"); return this.client; }
  configured(): boolean { return Boolean(this.client); }
}
export const githubRegistry = new GitHubProviderRegistry();
const repoSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().optional() });
const changesSchema = z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100);
const developerRoles = new Set(["OWNER", "ADMIN", "DEVELOPER"]);

export async function registerGitHubAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/github/status", { preHandler: authenticate }, async request => { const auth = request.user as AuthPayload; return { configured: githubRegistry.configured(), tenantId: auth.tenantId, capabilities: ["repository.read", "branch.read", "file.read", "branch.create", "commit", "push", "pull_request", "ci.read"] }; });
  app.post("/api/v1/github/repository", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.parse(request.body); try { return reply.send(await githubRegistry.getClient().getRepository(input)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/branches", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.parse(request.body); try { return reply.send(await githubRegistry.getClient().listBranches(input)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/file", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ path: z.string().min(1).max(1000), ref: z.string().max(200).optional() }).parse(request.body); try { return reply.send(await githubRegistry.getClient().getFile(input, input.path, input.ref)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/branch", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: z.string().regex(/^[A-Za-z0-9._/-]+$/).max(200), fromRef: z.string().max(200).optional(), approved: z.boolean().default(false) }).parse(request.body); const auth = request.user as AuthPayload; if (!developerRoles.has(auth.role)) return reply.code(403).send({ error: "GitHub branch creation requires developer permissions" }); try { validateBranchName(input.branch); if (requiresApproval("CREATE_BRANCH", input.branch) && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: "CREATE_BRANCH" }); return reply.code(201).send(await githubRegistry.getClient().createBranch(input, input.branch, input.fromRef)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub branch creation failed" }); } });
  app.post("/api/v1/github/commit", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes: changesSchema, approved: z.boolean().default(false) }).parse(request.body); const auth = request.user as AuthPayload; if (!developerRoles.has(auth.role)) return reply.code(403).send({ error: "Developer permission required" }); try { validateBranchName(input.branch); if (requiresApproval("COMMIT", input.branch) && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: "COMMIT", branch: input.branch, files: input.changes.map(c => c.path) }); return reply.send(await githubRegistry.getClient().commitChanges(input, input.branch, input.message, input.changes)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub commit failed" }); } });
  app.post("/api/v1/github/push", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes: changesSchema, approved: z.boolean().default(false) }).parse(request.body); const auth = request.user as AuthPayload; if (!developerRoles.has(auth.role)) return reply.code(403).send({ error: "Developer permission required" }); try { validateBranchName(input.branch); if (requiresApproval("PUSH", input.branch) && !input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: "PUSH", branch: input.branch, files: input.changes.map(c => c.path) }); return reply.send(await githubRegistry.getClient().push(input, input.branch, input.message, input.changes)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub push failed" }); } });
  app.post("/api/v1/github/pr", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ title: z.string().min(1).max(300), head: z.string().min(1).max(200), base: z.string().min(1).max(200), body: z.string().max(20_000).optional(), approved: z.boolean().default(false) }).parse(request.body); const auth = request.user as AuthPayload; if (!developerRoles.has(auth.role)) return reply.code(403).send({ error: "Developer permission required" }); if (!input.approved) return reply.code(409).send({ status: "WAITING_APPROVAL", requiresApproval: true, action: "CREATE_PR" }); try { return reply.code(201).send(await githubRegistry.getClient().createPullRequest(input, input.title, input.head, input.base, input.body)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "Pull request creation failed" }); } });
}
