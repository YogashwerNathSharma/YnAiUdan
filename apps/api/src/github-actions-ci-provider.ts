import type { CiProvider } from "./ci-result-adapter.js";
import type { CiRun } from "./ci-trigger-policy.js";

export type GitHubActionsApi = {
  listRuns(repo: string, sha: string): Promise<CiRun[]>;
  listJobs(repo: string, runId: number): Promise<Array<{ id: number; name: string; conclusion?: string; html_url?: string }>>;
};

export function createGitHubActionsCiProvider(api: GitHubActionsApi): CiProvider {
  return {
    getRunsForCommit: (repo, sha) => api.listRuns(repo, sha),
    getJobs: (repo, runId) => api.listJobs(repo, runId)
  };
}
