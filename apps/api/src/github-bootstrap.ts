import { GitHubHttpClient } from "./github-client.js";
import { githubRegistry } from "./github-agent.js";

export function bootstrapGitHub(): void {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) githubRegistry.setClient(new GitHubHttpClient(token));
}
