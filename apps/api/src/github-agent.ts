import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";

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
  getBranchSha?(repository: GitHubRepository, branch: string): Promise<string>;
};

export class GitHubProviderRegistry {
  private client?: GitHubClient;
  setClient(client: GitHubClient): void { this.client = client; }
  getClient(): GitHubClient { if (!this.client) throw new Error("GitHub integration is not configured"); return this.client; }
  configured(): boolean { return Boolean(this.client); }
}
export const githubRegistry = new GitHubProviderRegistry();
const repoSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().optional() });
const branchSchema = z.string().regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/).max(200);
const changesSchema = z.array(z.object({ path: z.string().min(1).max(1000).refine(value => !value.startsWith("/") && !value.split("/").includes(".."), "Invalid repository path"), content: z.string().max(2_000_000) })).min(1).max(100);
const protectedBranches = new Set(["main", "master", "production", "prod"]);
const writeRoles = new Set(["OWNER", "ADMIN", "DEVELOPER"]);
function repositoryKey(repo: GitHubRepository): string { return `${repo.owner}/${repo.name}`.toLowerCase(); }
function isRepositoryAllowed(repo: GitHubRepository): boolean { const configured = (process.env.GITHUB_ALLOWED_REPOSITORIES ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean); return configured.includes(repositoryKey(repo)); }
function assertWriteAccess(auth: AuthPayload, repo: GitHubRepository, branch: string, operation: "BRANCH" | "COMMIT" | "PUSH" | "PR"): void { if (!writeRoles.has(auth.role)) throw new Error("GitHub write access requires developer permissions"); if (!isRepositoryAllowed(repo)) throw new Error("Repository is not in GITHUB_ALLOWED_REPOSITORIES"); if (operation !== "PR" && protectedBranches.has(branch.toLowerCase())) throw new Error("Protected branches cannot be modified directly; use a feature branch and pull request"); if (operation === "PUSH" && auth.role !== "OWNER") throw new Error("Direct GitHub push requires OWNER permission"); }

export async function registerGitHubAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/github/status", { preHandler: authenticate }, async request => { const auth = request.user as AuthPayload; return { configured: githubRegistry.configured(), tenantId: auth.tenantId, capabilities: ["repository.read", "branch.read", "file.read", "branch.create", "commit", "push", "pull_request", "ci.read"] }; });
  app.post("/api/v1/github/repository", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.parse(request.body); try { return reply.send(await githubRegistry.getClient().getRepository(input)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/branches", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.parse(request.body); try { return reply.send(await githubRegistry.getClient().listBranches(input)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/file", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ path: z.string().min(1).max(1000).refine(value => !value.startsWith("/") && !value.split("/").includes(".."), "Invalid repository path"), ref: z.string().max(200).optional() }).parse(request.body); try { return reply.send(await githubRegistry.getClient().getFile(input, input.path, input.ref ?? input.defaultBranch)); } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); } });
  app.post("/api/v1/github/branch", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: branchSchema, fromRef: branchSchema.optional() }).parse(request.body); const auth = request.user as AuthPayload; try { assertWriteAccess(auth, input, input.branch, "BRANCH"); return reply.code(201).send(await githubRegistry.getClient().createBranch(input, input.branch, input.fromRef)); } catch (error) { return reply.code(403).send({ error: error instanceof Error ? error.message : "GitHub branch creation denied" }); } });
  app.post("/api/v1/github/commit", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: branchSchema, message: z.string().min(1).max(500), changes: changesSchema }).parse(request.body); const auth = request.user as AuthPayload; try { assertWriteAccess(auth, input, input.branch, "COMMIT"); return reply.send(await githubRegistry.getClient().commitChanges(input, input.branch, input.message, input.changes)); } catch (error) { return reply.code(403).send({ error: error instanceof Error ? error.message : "GitHub commit denied" }); } });
  app.post("/api/v1/github/push", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ branch: branchSchema, message: z.string().min(1).max(500), changes: changesSchema }).parse(request.body); const auth = request.user as AuthPayload; try { assertWriteAccess(auth, input, input.branch, "PUSH"); return reply.send(await githubRegistry.getClient().push(input, input.branch, input.message, input.changes)); } catch (error) { return reply.code(403).send({ error: error instanceof Error ? error.message : "GitHub push denied" }); } });
  app.post("/api/v1/github/pr", { preHandler: authenticate }, async (request, reply) => { const input = repoSchema.extend({ title: z.string().min(1).max(300), head: branchSchema, base: branchSchema, body: z.string().max(20_000).optional() }).parse(request.body); const auth = request.user as AuthPayload; try { assertWriteAccess(auth, input, input.base, "PR"); return reply.code(201).send(await githubRegistry.getClient().createPullRequest(input, input.title, input.head, input.base, input.body)); } catch (error) { return reply.code(403).send({ error: error instanceof Error ? error.message : "Pull request creation denied" }); } });
}
