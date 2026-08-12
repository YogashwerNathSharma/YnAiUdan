import { z } from "zod";
import { toolRegistry } from "./tools.js";
import { githubRegistry } from "./github-agent.js";

export function registerGitHubCodingTools(): void {
  if (!toolRegistry.get("github.inspect")) toolRegistry.register({
    name: "github.inspect",
    description: "Inspect a GitHub repository, branches, and explicitly requested files.",
    inputSchema: z.object({ owner: z.string(), name: z.string(), defaultBranch: z.string().optional(), ref: z.string().optional(), paths: z.array(z.string()).max(50).default([]) }),
    risk: "LOW",
    permissions: ["GITHUB_READ"],
    timeoutMs: 60_000,
    execute: async input => {
      const client = githubRegistry.getClient();
      const repository = await client.getRepository(input);
      const branches = await client.listBranches(input);
      const files = await Promise.all(input.paths.map(async path => ({ path, content: await client.getFile(input, path, input.ref ?? input.defaultBranch) })));
      return { repository, branches, files };
    }
  });
}
