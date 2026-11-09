import { z } from "zod";
import { toolRegistry } from "./tools.js";
import { githubRegistry } from "./github-agent.js";

const repo = z.object({ owner: z.string().regex(/^[A-Za-z0-9_.-]+$/), name: z.string().regex(/^[A-Za-z0-9_.-]+$/), defaultBranch: z.string().optional() });
const changes = z.array(z.object({ path: z.string().min(1).max(1000), content: z.string().max(2_000_000) })).min(1).max(100);
const branch = z.string().min(1).max(200).refine(value => !value.startsWith("-"), "Invalid branch name");

function assertWritableBranch(value: string, defaultBranch?: string): void { const protectedNames = new Set([defaultBranch, "main", "master", "production", "prod"].filter(Boolean)); if (protectedNames.has(value)) throw new Error("Direct writes to protected branches are not allowed; create/use a working branch and PR"); }
function readContent(value: unknown): string | null { if (typeof value === "string") return value; if (value && typeof value === "object" && "content" in value && typeof (value as { content?: unknown }).content === "string") return (value as { content: string }).content; return null; }
function commitShaFrom(value: unknown): string | undefined { if (!value || typeof value !== "object") return undefined; const object = value as Record<string, unknown>; return typeof object.sha === "string" ? object.sha : typeof object.commitSha === "string" ? object.commitSha : undefined; }
async function verifyChanges(input: { owner: string; name: string; defaultBranch?: string; branch: string; changes: Array<{ path: string; content: string }> }, operation: string, result: unknown) { const client = githubRegistry.getClient(); const checks = await Promise.all(input.changes.map(async change => { try { const observed = await client.getFile(input, change.path, input.branch); const content = readContent(observed); return { path: change.path, verified: content === change.content }; } catch { return { path: change.path, verified: false }; } })); const verified = checks.length > 0 && checks.every(check => check.verified); return { operation, verified, commitSha: commitShaFrom(result), files: checks }; }
function classifyTestPath(path: string): "unit" | "integration" | "e2e" | "config" | "unknown" { const value = path.toLowerCase(); if (/(^|\/)(e2e|cypress|playwright)(\/|$)|\.e2e\./.test(value)) return "e2e"; if (/(^|\/)(integration|integrations)(\/|$)|\.integration\./.test(value)) return "integration"; if (/(test|spec)(\/|$)|\.(test|spec)\./.test(value)) return "unit"; if (/(package\.json|vitest|jest|playwright|cypress|pytest|cargo\.toml|pom\.xml|build\.gradle)/.test(value)) return "config"; return "unknown"; }

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
      const files = await Promise.all((input.paths ?? []).map(async path => ({ path, content: await client.getFile(input, path, input.ref ?? input.defaultBranch) })));
      return { repository, branches, files };
    }
  });
}
