import { createHash, randomUUID } from "node:crypto";

export type ExecutionEventKind = "GOAL_ACCEPTED" | "PLAN_CREATED" | "AGENT_ASSIGNED" | "TOOL_REQUESTED" | "APPROVAL_REQUIRED" | "APPROVAL_GRANTED" | "EXECUTION_STARTED" | "EXECUTION_FINISHED" | "VERIFICATION_STARTED" | "VERIFICATION_FINISHED" | "REPAIR_STARTED" | "REPAIR_FINISHED" | "ARTIFACT_CREATED" | "TASK_COMPLETED" | "TASK_FAILED";
export type ExecutionEvidence = {
  id: string; taskId: string; tenantId: string; kind: ExecutionEventKind; timestamp: string;
  actor: "USER" | "AGENT" | "SYSTEM"; summary: string; data?: Record<string, unknown>;
  previousHash: string | null; integrityHash: string;
};
export type ExecutionLedger = { taskId: string; tenantId: string; events: ExecutionEvidence[]; createdAt: string };
const ledgers = new Map<string, ExecutionLedger>();
function hashEvent(event: Omit<ExecutionEvidence, "integrityHash">): string { return createHash("sha256").update(JSON.stringify(event)).digest("hex"); }

export function createExecutionLedger(taskId: string, tenantId: string): ExecutionLedger {
  const existing = ledgers.get(taskId); if (existing) return existing;
  const ledger: ExecutionLedger = { taskId, tenantId, events: [], createdAt: new Date().toISOString() }; ledgers.set(taskId, ledger); return ledger;
}
export function appendExecutionEvidence(input: Omit<ExecutionEvidence, "id" | "timestamp" | "integrityHash" | "previousHash">): ExecutionEvidence {
  const ledger = createExecutionLedger(input.taskId, input.tenantId);
  const previousHash = ledger.events.at(-1)?.integrityHash ?? null;
  const event: Omit<ExecutionEvidence, "integrityHash"> = { ...input, id: randomUUID(), timestamp: new Date().toISOString(), previousHash };
  const evidence: ExecutionEvidence = { ...event, integrityHash: hashEvent(event) }; ledger.events.push(evidence); return evidence;
}
export function getExecutionLedger(taskId: string, tenantId: string): ExecutionLedger {
  const ledger = ledgers.get(taskId); if (!ledger || ledger.tenantId !== tenantId) throw new Error("Execution ledger not found"); return ledger;
}
export function verifyExecutionLedger(ledger: ExecutionLedger): { valid: boolean; checked: number; invalidEventIds: string[] } {
  const invalidEventIds: string[] = []; let previousHash: string | null = null;
  for (const event of ledger.events) {
    const { integrityHash, ...payload } = event;
    if (payload.previousHash !== previousHash || hashEvent(payload) !== integrityHash) invalidEventIds.push(event.id);
    previousHash = integrityHash;
  }
  return { valid: invalidEventIds.length === 0, checked: ledger.events.length, invalidEventIds };
}
