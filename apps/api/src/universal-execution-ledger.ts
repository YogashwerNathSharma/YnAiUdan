import { createHash, randomUUID } from "node:crypto";
import { db } from "./db.js";

export type ExecutionEventKind = "GOAL_ACCEPTED" | "PLAN_CREATED" | "AGENT_ASSIGNED" | "TOOL_REQUESTED" | "APPROVAL_REQUIRED" | "APPROVAL_GRANTED" | "EXECUTION_STARTED" | "EXECUTION_FINISHED" | "VERIFICATION_STARTED" | "VERIFICATION_FINISHED" | "REPAIR_STARTED" | "REPAIR_FINISHED" | "ARTIFACT_CREATED" | "TASK_COMPLETED" | "TASK_FAILED";
export type ExecutionEvidence = {
  id: string; taskId: string; tenantId: string; sequence: number; kind: ExecutionEventKind; timestamp: string;
  actor: "USER" | "AGENT" | "SYSTEM"; summary: string; data?: Record<string, unknown>;
  previousHash: string | null; integrityHash: string;
};
export type ExecutionLedger = { taskId: string; tenantId: string; events: ExecutionEvidence[]; createdAt: string };

type PersistedAuditEvent = {
  id: string; taskId: string; tenantId: string; sequence: number; kind: string; actor: string; summary: string;
  data: unknown; timestamp: Date; previousHash: string | null; integrityHash: string;
};

function hashEvent(event: Omit<ExecutionEvidence, "integrityHash">): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function toEvidence(event: PersistedAuditEvent): ExecutionEvidence {
  return {
    id: event.id,
    taskId: event.taskId,
    tenantId: event.tenantId,
    sequence: event.sequence,
    kind: event.kind as ExecutionEventKind,
    timestamp: event.timestamp.toISOString(),
    actor: event.actor as ExecutionEvidence["actor"],
    summary: event.summary,
    ...(event.data === null ? {} : { data: event.data as Record<string, unknown> }),
    previousHash: event.previousHash,
    integrityHash: event.integrityHash,
  };
}

export async function createExecutionLedger(taskId: string, tenantId: string): Promise<ExecutionLedger> {
  const events = await db.taskAuditEvent.findMany({ where: { taskId, tenantId }, orderBy: { sequence: "asc" } });
  return { taskId, tenantId, events: events.map(toEvidence), createdAt: events[0]?.timestamp.toISOString() ?? new Date().toISOString() };
}

export async function appendExecutionEvidence(
  input: Omit<ExecutionEvidence, "id" | "timestamp" | "integrityHash" | "previousHash" | "sequence">
): Promise<ExecutionEvidence> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await db.taskAuditEvent.findFirst({ where: { taskId: input.taskId, tenantId: input.tenantId }, orderBy: { sequence: "desc" } });
    const sequence = (last?.sequence ?? 0) + 1;
    const previousHash = last?.integrityHash ?? null;
    const timestamp = new Date().toISOString();
    const id = randomUUID();
    const candidate: ExecutionEvidence = { ...input, id, timestamp, sequence, previousHash, integrityHash: "" };
    candidate.integrityHash = hashEvent(candidate);
    try {
      const saved = await db.taskAuditEvent.create({
        data: {
          id, taskId: input.taskId, tenantId: input.tenantId, sequence, kind: input.kind,
          actor: input.actor, summary: input.summary, data: input.data ?? undefined,
          timestamp: new Date(timestamp), previousHash, integrityHash: candidate.integrityHash,
        },
      });
      return toEvidence(saved);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("Unable to append execution evidence");
}

export async function getExecutionLedger(taskId: string, tenantId: string): Promise<ExecutionLedger> {
  return createExecutionLedger(taskId, tenantId);
}

export function verifyExecutionLedger(ledger: ExecutionLedger): { valid: boolean; checked: number; invalidEventIds: string[] } {
  const invalidEventIds: string[] = [];
  let previousHash: string | null = null;
  let expectedSequence = 1;
  for (const event of ledger.events) {
    const { integrityHash, ...payload } = event;
    if (event.sequence !== expectedSequence || payload.previousHash !== previousHash || hashEvent(payload) !== integrityHash) invalidEventIds.push(event.id);
    previousHash = integrityHash;
    expectedSequence += 1;
  }
  return { valid: invalidEventIds.length === 0, checked: ledger.events.length, invalidEventIds };
}
