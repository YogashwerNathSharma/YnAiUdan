import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";

type AuthPayload = { sub: string; tenantId: string; role: string };

export type GitHubRepository = { owner: string; name: string; defaultBranch?: string };
export type GitHubClient = {
  getRepository(repository: GitHubRepository): Promise<unknown>;
  listBranches(repository: GitHubRepository): Promise<unknown[]>;
  getFile(repository: GitHubRepository, path: string, ref?: string): Promise<unknown>;
  createBranch(repository: GitHubRepository, branch: string, fromRef?: string): Promise<unknown>;
};

export class GitHubProviderRegistry {
  private client?: GitHubClient;
  setClient(client: GitHubClient): void { this.client = client; }
  getClient(): GitHubClient { if (!this.client) throw new Error("GitHub integration is not configured"); return this.client; }
  configured(): boolean { return Boolean(this.client); }
}

export const githubRegistry = new GitHubProviderRegistry();
const repoSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().optional() });

export async function registerGitHubAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/github/status", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    return { configured: githubRegistry.configured(), tenantId: auth.tenantId, capabilities: ["repository.read", "branch.read", "file.read", "branch.create"] };
  });

  app.post("/api/v1/github/repository", { preHandler: authenticate }, async (request, reply) => {
    const input = repoSchema.parse(request.body);
    try { return reply.send(await githubRegistry.getClient().getRepository(input)); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });

  app.post("/api/v1/github/branches", { preHandler: authenticate }, async (request, reply) => {
    const input = repoSchema.parse(request.body);
    try { return reply.send(await githubRegistry.getClient().listBranches(input)); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });

  app.post("/api/v1/github/file", { preHandler: authenticate }, async (request, reply) => {
    const input = repoSchema.extend({ path: z.string().min(1).max(1000), ref: z.string().max(200).optional() }).parse(request.body);
    try { return reply.send(await githubRegistry.getClient().getFile(input, input.path, input.ref)); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });

  app.post("/api/v1/github/branch", { preHandler: authenticate }, async (request, reply) => {
    const input = repoSchema.extend({ branch: z.string().regex(/^[A-Za-z0-9._/-]+$/).max(200), fromRef: z.string().max(200).optional() }).parse(request.body);
    const auth = request.user as AuthPayload;
    if (!["OWNER", "ADMIN", "DEVELOPER"].includes(auth.role)) return reply.code(403).send({ error: "GitHub branch creation requires developer permissions" });
    try { return reply.code(201).send(await githubRegistry.getClient().createBranch(input, input.branch, input.fromRef)); }
    catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : "GitHub integration unavailable" }); }
  });
}
