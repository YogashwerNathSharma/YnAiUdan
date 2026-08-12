import type { GitHubClient, GitHubRepository } from "./github-agent.js";

type GitHubResponse = { ok: boolean; status: number; data: unknown };

export class GitHubHttpClient implements GitHubClient {
  constructor(private readonly token: string, private readonly apiBase = "https://api.github.com") {}

  private async request(path: string, init: RequestInit = {}): Promise<GitHubResponse> {
    const response = await fetch(`${this.apiBase}${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28", ...init.headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return { ok: response.ok, status: response.status, data };
  }

  async getRepository(repo: GitHubRepository): Promise<unknown> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`)).data; }
  async listBranches(repo: GitHubRepository): Promise<unknown[]> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches?per_page=100`)).data as unknown[]; }
  async getFile(repo: GitHubRepository, filePath: string, ref?: string): Promise<unknown> {
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}${suffix}`)).data;
  }
  async createBranch(repo: GitHubRepository, branch: string, fromRef?: string): Promise<unknown> {
    const base = fromRef ?? repo.defaultBranch ?? "main";
    const ref = await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/ref/heads/${base}`);
    const sha = (ref.data as { object?: { sha?: string } }).object?.sha;
    if (!sha) throw new Error("Unable to resolve source branch SHA");
    return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) })).data;
  }
}
