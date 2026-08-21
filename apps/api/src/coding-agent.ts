import { autoFix } from "./auto-fix.js";
import { reviewChanges, type ChangeRecord, type ChangeReview } from "./change-reviewer.js";
import { verifyCodeChange, type VerificationResult } from "./code-verification.js";
import type { AutonomyMode } from "./permissions.js";

export type CodingAgentRun = {
  verification: VerificationResult[];
  changeReview: ChangeReview;
  fixAttempts: number;
  status: "VERIFIED" | "NEEDS_REVIEW" | "FAILED";
};

export async function runCodingVerification(params: {
  role: string;
  mode?: AutonomyMode;
  tenantId: string;
  userId: string;
  projectId?: string;
  requestedPaths?: string[];
  changes: ChangeRecord[];
  commands?: string[];
  maxFixAttempts?: number;
  fix?: (failure: VerificationResult, attempt: number) => Promise<boolean>;
}): Promise<CodingAgentRun> {
  let verification = await verifyCodeChange(params);
  let fixAttempts = 0;
  const maxFixAttempts = Math.min(5, Math.max(0, params.maxFixAttempts ?? 2));

  while (!verification.every(result => result.ok) && fixAttempts < maxFixAttempts && params.fix) {
    const failure = verification.find(result => !result.ok);
    if (!failure) break;
    fixAttempts += 1;
    const changed = await params.fix(failure, fixAttempts);
    if (!changed) break;
    verification = await verifyCodeChange(params);
  }

  const changeReview = reviewChanges(params.changes, params.requestedPaths);
  const verified = verification.length > 0 && verification.every(result => result.ok);
  const safe = changeReview.approved;
  return {
    verification,
    changeReview,
    fixAttempts,
    status: verified && safe ? "VERIFIED" : verified ? "NEEDS_REVIEW" : "FAILED"
  };
}
