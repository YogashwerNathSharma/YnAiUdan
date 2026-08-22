export type CiTrigger = "push" | "pull_request";

export type CiRun = {
  id: number;
  head_sha?: string;
  event?: CiTrigger | string;
  status?: string;
  conclusion?: string;
  html_url?: string;
  created_at?: string;
};

export function selectCiRun(runs: CiRun[], sha: string, preferredTrigger?: CiTrigger): CiRun | undefined {
  return runs
    .filter(run => !run.head_sha || run.head_sha === sha)
    .filter(run => !preferredTrigger || run.event === preferredTrigger)
    .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""))[0];
}

export function ciTriggerForRef(ref: string, base?: string): CiTrigger {
  return base && ref !== base ? "pull_request" : "push";
}
