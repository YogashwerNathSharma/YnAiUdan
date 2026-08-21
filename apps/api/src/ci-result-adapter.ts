export type CiStatus = "SUCCESS" | "FAILURE" | "CANCELLED" | "IN_PROGRESS" | "UNKNOWN";
export type CiResult = { status: CiStatus; runId?: number; sha?: string; url?: string; failedJobs: Array<{ id: number; name: string; conclusion?: string; url?: string }>; summary: string };

type WorkflowRun = { id: number; head_sha?: string; status?: string; conclusion?: string; html_url?: string; jobs_url?: string };
type WorkflowJob = { id: number; name: string; conclusion?: string; html_url?: string };

export interface CiProvider { getRunsForCommit(repo: string, sha: string): Promise<WorkflowRun[]>; getJobs(repo: string, runId: number): Promise<WorkflowJob[]>; }

function mapStatus(run?: WorkflowRun): CiStatus {
  if (!run) return "UNKNOWN";
  if (run.status && run.status !== "completed") return "IN_PROGRESS";
  if (run.conclusion === "success") return "SUCCESS";
  if (run.conclusion === "cancelled") return "CANCELLED";
  if (run.conclusion === "failure") return "FAILURE";
  return "UNKNOWN";
}

export async function inspectCiForCommit(provider: CiProvider, repo: string, sha: string): Promise<CiResult> {
  const runs = await provider.getRunsForCommit(repo, sha);
  if (!runs.length) return { status: "UNKNOWN", sha, failedJobs: [], summary: "No GitHub Actions workflow run is available for this commit." };
  const run = runs[0];
  const jobs = await provider.getJobs(repo, run.id);
  const failedJobs = jobs.filter(job => job.conclusion === "failure").map(job => ({ id: job.id, name: job.name, conclusion: job.conclusion, url: job.html_url }));
  const status = mapStatus(run);
  return { status, runId: run.id, sha, url: run.html_url, failedJobs, summary: failedJobs.length ? `${failedJobs.length} CI job(s) failed.` : `CI status: ${status}.` };
}
