import { z } from "zod";

export const ciFailureCategorySchema = z.enum([
  "TYPE_ERROR",
  "TEST_FAILURE",
  "LINT",
  "BUILD",
  "DEPENDENCY",
  "RUNTIME",
  "CONFIG",
  "CI_INFRA",
  "UNKNOWN"
]);
export type CiFailureCategory = z.infer<typeof ciFailureCategorySchema>;

export type CiStep = { name: string; conclusion?: string | null; status?: string | null; number?: number };
export type CiJob = { id: number; name: string; conclusion?: string | null; status?: string | null; steps?: CiStep[] };

export type CiFailureAnalysis = {
  category: CiFailureCategory;
  confidence: number;
  failedJob?: string;
  failedStep?: string;
  evidence: string[];
  downstreamSkipped: string[];
  repairable: boolean;
  recommendation: string;
};

const patterns: Array<{ category: CiFailureCategory; regex: RegExp[] }> = [
  { category: "TYPE_ERROR", regex: [/TS\d{3,5}/i, /type .* is not assignable/i, /cannot find name/i] },
  { category: "TEST_FAILURE", regex: [/\btest failed\b/i, /assert(?:ion)? .* failed/i, /FAIL\s+.*\.(?:test|spec)/i] },
  { category: "LINT", regex: [/eslint/i, /lint.*error/i, /prettier.*check/i] },
  { category: "BUILD", regex: [/build failed/i, /webpack/i, /vite.*error/i, /next build/i] },
  { category: "DEPENDENCY", regex: [/ERR_PNPM/i, /npm ERR!/i, /peer dep/i, /lockfile/i, /module not found/i] },
  { category: "RUNTIME", regex: [/uncaught exception/i, /ECONNREFUSED/i, /EADDRINUSE/i, /runtime error/i] },
  { category: "CONFIG", regex: [/environment variable/i, /missing.*secret/i, /invalid configuration/i, /configuration error/i] }
];

export function analyzeCiFailure(input: { jobs: CiJob[]; log?: string }): CiFailureAnalysis {
  const jobs = input.jobs ?? [];
  const failedJob = jobs.find(job => job.conclusion === "failure");
  const failedStep = failedJob?.steps?.find(step => step.conclusion === "failure");
  const skipped = (failedJob?.steps ?? []).filter(step => step.conclusion === "skipped").map(step => step.name);
  const evidence: string[] = [];

  if (failedJob) evidence.push(`job:${failedJob.name}`);
  if (failedStep) evidence.push(`step:${failedStep.name}`);
  if (skipped.length) evidence.push(`downstream-skipped:${skipped.length}`);

  const text = input.log ?? "";
  for (const candidate of patterns) {
    if (candidate.regex.some(regex => regex.test(text))) {
      return {
        category: candidate.category,
        confidence: 0.9,
        failedJob: failedJob?.name,
        failedStep: failedStep?.name,
        evidence,
        downstreamSkipped: skipped,
        repairable: !["CI_INFRA", "RUNTIME"].includes(candidate.category),
        recommendation: candidate.category === "DEPENDENCY" ? "Inspect package manager, lockfile and dependency compatibility before changing application code." : "Inspect the reported source/test/build context and generate the smallest safe patch."
      };
    }
  }

  const infraStep = failedStep?.name && /setup-node|checkout|pnpm\/action-setup|upload|download|cache/i.test(failedStep.name);
  if (infraStep || (failedJob && skipped.length > 0 && !text)) {
    return {
      category: "CI_INFRA",
      confidence: infraStep ? 0.96 : 0.75,
      failedJob: failedJob?.name,
      failedStep: failedStep?.name,
      evidence,
      downstreamSkipped: skipped,
      repairable: false,
      recommendation: "Inspect the GitHub Actions runner/action configuration first. Do not modify application code until the CI environment failure is resolved."
    };
  }

  return { category: "UNKNOWN", confidence: 0.2, failedJob: failedJob?.name, failedStep: failedStep?.name, evidence, downstreamSkipped: skipped, repairable: false, recommendation: "Collect the failed step log and additional check-run evidence before attempting a code repair." };
}
