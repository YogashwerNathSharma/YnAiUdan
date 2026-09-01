import type { AgentWorkspace } from "./agent-workspace.js";
import type { ChangeLedgerEntry } from "./project-constitution.js";

export type AgentProposal = {
  workspaceProjectId: string;
  workItemId: string;
  agent: AgentWorkspace["agent"];
  summary: string;
  affectedScopes: string[];
  changes: Array<{ path: string; operation: "CREATE" | "MODIFY" | "DELETE"; reason: string }>;
  tests: string[];
  evidence: string[];
  architectureChanges: string[];
  ledger: ChangeLedgerEntry[];
};

export function validateAgentProposal(workspace: AgentWorkspace, proposal: AgentProposal): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (proposal.workspaceProjectId !== workspace.projectId) reasons.push("PROJECT_MISMATCH");
  if (proposal.workItemId !== workspace.workItem.id) reasons.push("WORK_ITEM_MISMATCH");
  if (proposal.agent !== workspace.agent) reasons.push("AGENT_MISMATCH");
  if (!proposal.summary.trim()) reasons.push("SUMMARY_REQUIRED");
  if (!proposal.changes.length) reasons.push("NO_CHANGES_PROPOSED");
  if (workspace.requiredOutputs.includes("TESTS") && !proposal.tests.length) reasons.push("TESTS_REQUIRED");
  if (workspace.requiredOutputs.includes("EVIDENCE") && !proposal.evidence.length) reasons.push("EVIDENCE_REQUIRED");
  if (workspace.requiredOutputs.includes("ARCHITECTURE_CHANGE") && !proposal.architectureChanges.length) reasons.push("ARCHITECTURE_CHANGE_RECORD_REQUIRED");
  if (workspace.requiredOutputs.includes("CHANGE_LEDGER") && !proposal.ledger.length) reasons.push("CHANGE_LEDGER_REQUIRED");
  const allowedPaths = new Set(workspace.workItem.dependsOn.concat(workspace.workItem.id));
  if (proposal.changes.some(change => !change.path.trim())) reasons.push("EMPTY_CHANGE_PATH");
  if (allowedPaths.size === 0 && proposal.changes.length > 0) reasons.push("WORK_SCOPE_NOT_BOUND");
  return { valid: reasons.length === 0, reasons };
}
