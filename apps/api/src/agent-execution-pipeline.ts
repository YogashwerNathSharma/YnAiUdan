import type { AgentProposal } from "./agent-execution-contract.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import { validateAgentProposal } from "./agent-execution-contract.js";

export type ExecutionGate = "VALIDATE" | "APPROVAL" | "APPLY" | "VERIFY" | "COMMIT";
export type ExecutionPipelineResult = { approved: boolean; nextGate: ExecutionGate; reasons: string[]; audit: string[] };

export function evaluateAgentExecution(workspace: AgentWorkspace, proposal: AgentProposal, approvalGranted: boolean): ExecutionPipelineResult {
  const validation = validateAgentProposal(workspace, proposal);
  const audit = ["PROPOSAL_RECEIVED", validation.valid ? "CONTRACT_VALID" : "CONTRACT_REJECTED"];
  if (!validation.valid) return { approved: false, nextGate: "VALIDATE", reasons: validation.reasons, audit };
  if (!approvalGranted) return { approved: false, nextGate: "APPROVAL", reasons: ["APPROVAL_REQUIRED"], audit: [...audit, "WAITING_APPROVAL"] };
  return { approved: true, nextGate: "APPLY", reasons: [], audit: [...audit, "APPROVED_FOR_APPLY"] };
}

export function completeAgentExecution(input: { pipeline: ExecutionPipelineResult; testsPassed: boolean; evidencePresent: boolean }): ExecutionPipelineResult {
  if (!input.pipeline.approved) return input.pipeline;
  if (!input.testsPassed || !input.evidencePresent) return { approved: false, nextGate: "VERIFY", reasons: [!input.testsPassed ? "TESTS_FAILED" : "EVIDENCE_MISSING"], audit: [...input.pipeline.audit, "VERIFY_REJECTED"] };
  return { approved: true, nextGate: "COMMIT", reasons: [], audit: [...input.pipeline.audit, "VERIFY_PASSED", "READY_TO_COMMIT"] };
}
