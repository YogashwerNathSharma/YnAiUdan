import type { FastifyInstance } from "fastify";
import { registerGitHubAgentRoutes } from "./github-agent.js";

export async function registerGitHubIntegration(app: FastifyInstance): Promise<void> {
  await registerGitHubAgentRoutes(app);
}
