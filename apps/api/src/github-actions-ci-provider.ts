import type { CiProvider } from "./ci-result-adapter.js";

export type GitHubActionsApi = {
  listRuns(repo: string, sha: string): Promise<Array<{ id: number; head_sha?: string; status?: string; conclusion?: string; html_url?: string; jobs_url?: string }>>;
  listJobs(repo: string, runId: number): Promise<Array<{ id: number; name: string; conclusion?: string; html_url?: string }>>;
};

export function createGitHubActionsCiProvider(api: GitHubActionsApi): CiProvider {
  return {
    getRunsForCommit: (repo, sha) => api.listRuns(repo, sha),
    getJobs: (repo, runId) => api.listJobs(repo, runId)
  };
}
