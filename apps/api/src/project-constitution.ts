import { createHash } from "node:crypto";

export type ProjectConstitution = {
  version: 1;
  projectId: string;
  requirements: string[];
  platforms: Array<"WEB" | "ANDROID" | "IOS" | "API" | "IMAGE" | "VIDEO" | "OTHER">;
  architectureRules: string[];
  protectedAreas: string[];
  conventions: string[];
  decisions: Array<{ id: string; decision: string; reason: string; status: "ACTIVE" | "SUPERSEDED" }>;
};

export type ChangeLedgerEntry = {
  id: string;
  projectId: string;
  timestamp: string;
  changeType: "CREATE" | "MODIFY" | "REFACTOR" | "RESTRUCTURE" | "MIGRATION" | "REMOVE" | "CONFIGURE";
  scope: string[];
  reason: string;
  before: string;
  after: string;
  verification: string[];
  supersedes?: string;
};

export function createChangeLedgerEntry(input: Omit<ChangeLedgerEntry, "id" | "timestamp">): ChangeLedgerEntry {
  const timestamp = new Date().toISOString();
  const canonical = JSON.stringify({ ...input, timestamp });
  return { ...input, id: createHash("sha256").update(canonical).digest("hex").slice(0, 16), timestamp };
}

export function validateChangeAgainstConstitution(change: ChangeLedgerEntry, constitution: ProjectConstitution): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const protectedHit = change.scope.filter(item => constitution.protectedAreas.some(area => item.startsWith(area) || area.startsWith(item)));
  if (protectedHit.length && change.changeType !== "MODIFY" && change.changeType !== "REFACTOR" && change.changeType !== "RESTRUCTURE") reasons.push(`Protected area requires explicit compatible change: ${protectedHit.join(", ")}`);
  if (!change.reason.trim()) reasons.push("Change reason is required");
  if (!change.verification.length) reasons.push("Verification evidence is required");
  return { allowed: reasons.length === 0, reasons };
}
