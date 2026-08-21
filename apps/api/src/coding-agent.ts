import { reviewChanges, type ChangeRecord, type ChangeReview } from "./change-reviewer.js";
import { fullReview, type FullReview } from "./full-reviewer.js";
import { verifyCodeChange, type VerificationResult } from "./code-verification.js";
import type { AutonomyMode } from "./permissions.js";

export type CodingAgentRun = {
  verification: VerificationResult[];
  changeReview: ChangeReview;
  fullReview: FullReview;
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
  reviewFiles?: Array<{ path: string; content: string }>;
  packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> };
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
  const full = fullReview({ files: params.reviewFiles ?? [], packageJson: params.packageJson });
  const verified = verification.length > 0 && verification.every(result => result.ok);
  const safe = changeReview.approved && full.approved;
  return {
    verification,
    changeReview,
    fullReview: full,
    fixAttempts,
    status: verified && safe ? "VERIFIED" : verified ? "NEEDS_REVIEW" : "FAILED"
  };
}
