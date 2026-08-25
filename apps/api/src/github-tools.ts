import { z } from "zod";
import { toolRegistry } from "./tools.js";
import { githubRegistry } from "./github-agent.js";

const repo = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().optional() });
const changes = z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100);

export function registerGitHubCodingTools(): void {
  if (!toolRegistry.get("github.inspect")) toolRegistry.register({
    name: "github.inspect",
    description: "Inspect a GitHub repository, branches, and explicitly requested files.",
    inputSchema: repo.extend({ ref: z.string().optional(), paths: z.array(z.string()).max(50).default([]) }),
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

  if (!toolRegistry.get("github.commit")) toolRegistry.register({
    name: "github.commit",
    description: "Create a Git commit from supplied file changes. Requires explicit approval through the GitHub write policy.",
    inputSchema: repo.extend({ branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes }),
    risk: "HIGH",
    permissions: ["GITHUB_WRITE"],
    timeoutMs: 120_000,
    execute: async input => githubRegistry.getClient().commitChanges(input, input.branch, input.message, input.changes)
  });

  if (!toolRegistry.get("github.push")) toolRegistry.register({
    name: "github.push",
    description: "Push supplied changes to an existing GitHub branch. Requires explicit approval and GitHub push permission.",
    inputSchema: repo.extend({ branch: z.string().min(1).max(200), message: z.string().min(1).max(500), changes }),
    risk: "CRITICAL",
    permissions: ["GITHUB_PUSH"],
    timeoutMs: 120_000,
    execute: async input => githubRegistry.getClient().push(input, input.branch, input.message, input.changes)
  });

  if (!toolRegistry.get("github.create_pr")) toolRegistry.register({
    name: "github.create_pr",
    description: "Create a GitHub pull request from a prepared branch. Requires explicit approval.",
    inputSchema: repo.extend({ title: z.string().min(1).max(300), head: z.string().min(1).max(200), base: z.string().min(1).max(200), body: z.string().max(20_000).optional() }),
    risk: "HIGH",
    permissions: ["PR_CREATE"],
    timeoutMs: 60_000,
    execute: async input => githubRegistry.getClient().createPullRequest(input, input.title, input.head, input.base, input.body)
  });
}
