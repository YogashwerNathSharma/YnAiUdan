import type { GitHubClient, GitHubRepository, GitHubFileChange } from "./github-agent.js";

type GitHubResponse = { ok: boolean; status: number; data: any };
export class GitHubHttpClient implements GitHubClient {
  constructor(private readonly token: string, private readonly apiBase = "https://api.github.com") {}
  private async request(path: string, init: RequestInit = {}): Promise<GitHubResponse> { const response = await fetch(`${this.apiBase}${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...init.headers } }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(`GitHub API ${response.status}: ${data?.message ?? "request failed"}`); return { ok: response.ok, status: response.status, data }; }
  async getRepository(repo: GitHubRepository): Promise<unknown> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`)).data; }
  async listBranches(repo: GitHubRepository): Promise<unknown[]> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches?per_page=100`)).data as unknown[]; }
  async getFile(repo: GitHubRepository, filePath: string, ref?: string): Promise<unknown> { const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : ""; return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}${suffix}`)).data; }
  async searchCode(repo: GitHubRepository, query: string): Promise<unknown[]> { const scoped = `${query} repo:${repo.owner}/${repo.name}`; return (await this.request(`/search/code?q=${encodeURIComponent(scoped)}&per_page=100`)).data?.items as unknown[] ?? []; }
  async createBranch(repo: GitHubRepository, branch: string, fromRef?: string): Promise<unknown> { const base = fromRef ?? repo.defaultBranch ?? "main"; const ref = await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/ref/heads/${encodeURIComponent(base)}`); const sha = ref.data?.object?.sha; if (!sha) throw new Error("Unable to resolve source branch SHA"); return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) })).data; }
  async commitChanges(repo: GitHubRepository, branch: string, message: string, changes: GitHubFileChange[]): Promise<unknown> { return this.writeTree(repo, branch, message, changes, false); }
  async push(repo: GitHubRepository, branch: string, message: string, changes: GitHubFileChange[]): Promise<unknown> { return this.writeTree(repo, branch, message, changes, true); }
  private async writeTree(repo: GitHubRepository, branch: string, message: string, changes: GitHubFileChange[], moveRef: boolean): Promise<unknown> {
    const prefix = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
    const ref = await this.request(`${prefix}/git/ref/heads/${encodeURIComponent(branch)}`); const parentSha = ref.data?.object?.sha; if (!parentSha) throw new Error("Unable to resolve branch SHA");
    const parent = await this.request(`${prefix}/git/commits/${parentSha}`); const baseTree = parent.data?.tree?.sha; if (!baseTree) throw new Error("Unable to resolve base tree");
    const tree = await this.request(`${prefix}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: changes.map(change => ({ path: change.path, mode: "100644", type: "blob", content: change.content })) }) });
    const treeSha = tree.data?.sha; if (!treeSha) throw new Error("Unable to create Git tree");
    const commit = await this.request(`${prefix}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }) }); const commitSha = commit.data?.sha; if (!commitSha) throw new Error("Unable to create Git commit");
    if (moveRef) await this.request(`${prefix}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commitSha, force: false }) });
    return { commitSha, branch, pushed: moveRef, changedFiles: changes.map(change => change.path) };
  }
  async createPullRequest(repo: GitHubRepository, title: string, head: string, base: string, body?: string): Promise<unknown> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`, { method: "POST", body: JSON.stringify({ title, head, base, body: body ?? "Created by YnAiUdan with explicit approval." }) })).data; }
  async getCommitStatus(repo: GitHubRepository, sha: string): Promise<unknown> { return (await this.request(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/commits/${encodeURIComponent(sha)}/status`)).data; }
}
