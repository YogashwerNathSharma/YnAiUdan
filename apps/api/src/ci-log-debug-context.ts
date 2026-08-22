export type FailedCiJob = { id: number; name: string; conclusion?: string; url?: string; log?: string };

export type DebugContext = {
  source: "github-actions";
  runId: number;
  sha: string;
  jobs: Array<{ id: number; name: string; conclusion?: string; url?: string; log?: string }>;
  prompt: string;
};

export function buildCiDebugContext(runId: number, sha: string, jobs: FailedCiJob[]): DebugContext {
  const failed = jobs.filter(job => job.conclusion === "failure");
  const prompt = failed.length
    ? [
        "Analyze these GitHub Actions failures and propose the smallest safe repair.",
        `Commit: ${sha}`,
        ...failed.map(job => `Job ${job.id} (${job.name})${job.url ? `: ${job.url}` : ""}\n${(job.log ?? "").slice(-12000)}`)
      ].join("\n\n")
    : "No failed GitHub Actions jobs were supplied; do not invent a failure.";
  return { source: "github-actions", runId, sha, jobs, prompt };
}
