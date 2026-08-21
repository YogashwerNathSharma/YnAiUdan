import type { CiProvider, CiResult } from "./ci-result-adapter.js";
import { inspectCiForCommit } from "./ci-result-adapter.js";

export type CiRepairDecision = { action: "WAIT" | "DEBUG" | "READY"; reason: string; ci: CiResult };

export async function decideCiRepairAction(provider: CiProvider, repo: string, sha: string): Promise<CiRepairDecision> {
  const ci = await inspectCiForCommit(provider, repo, sha);
  if (ci.status === "IN_PROGRESS") return { action: "WAIT", reason: "CI is still running.", ci };
  if (ci.status === "FAILURE") return { action: "DEBUG", reason: ci.summary, ci };
  if (ci.status === "SUCCESS") return { action: "READY", reason: "CI passed.", ci };
  return { action: "WAIT", reason: ci.summary, ci };
}
