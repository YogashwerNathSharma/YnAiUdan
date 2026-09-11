import { createHash } from "node:crypto";
import { db } from "./db.js";
import { executeNextTaskStep } from "./task-executor.js";
import { planToolSteps } from "./tool-planner.js";
import { evaluateAgentRun } from "./agent-evaluation.js";
import { learnFromCompletedExperience } from "./experience-learning.js";
import { appendExecutionEvidence } from "./universal-execution-ledger.js";

export type BrainRunOptions = { userId: string; tenantId: string; role: string; maxCycles?: number; replanOnFailure?: boolean };
function diagnosticFromResult(result: unknown): string | undefined { if (!result || typeof result !== "object") return undefined; const value = result as Record<string, unknown>; const error = typeof value.error === "string" ? value.error : undefined; const evidence = value.evidence && typeof value.evidence === "object" ? JSON.stringify(value.evidence) : undefined; const output = typeof value.output === "string" ? value.output : undefined; const combined = [error, evidence, output].filter(Boolean).join("\n"); return combined ? combined.slice(0, 30_000) : undefined; }
function failureFingerprint(result: unknown): string | undefined { const diagnostic = diagnosticFromResult(result); if (!diagnostic) return undefined; return createHash("sha256").update(diagnostic.replace(/\b[0-9a-f]{7,64}\b/gi, "SHA").replace(/\b\d+\b/g, "N").trim().toLowerCase()).digest("hex"); }
function strategyHints(result: unknown): string | undefined { if (!result || typeof result !== "object") return undefined; const value = result as Record<string, unknown>; const raw = value.recommendedStrategies; if (!Array.isArray(raw)) return undefined; const hints = raw.slice(0, 5).map(item => { if (!item || typeof item !== "object") return null; const row = item as Record<string, unknown>; return typeof row.strategy === "string" ? row.strategy : null; }).filter(Boolean); return hints.length ? hints.join("\n") : undefined; }
function completedEvidenceCount(task: { steps: Array<{ status: string; output?: unknown }> }): number { return task.steps.filter(step => { const output = step.output; return Boolean(output && typeof output === "object" && (((output as Record<string, unknown>).verification && typeof (output as Record<string, unknown>).verification === "object") || (output as Record<string, unknown>).result)); }).length; }
function verifiedTaskResult(result: unknown): boolean { if (!result || typeof result !== "object") return false; const verification = (result as Record<string, unknown>).verification; return Boolean(verification && typeof verification === "object" && (verification as Record<string, unknown>).verified === true); }
type PlannedStep = { id: string; sequence: number | null; status: string; input?: unknown };
function readyParallelBatch(steps: PlannedStep[], maxBatch = 4): PlannedStep[] {
  const pending = steps.filter(step => step.status === "PENDING"); if (!pending.length) return [];
  const first = pending[0]; const firstInput = first.input && typeof first.input === "object" ? first.input as Record<string, unknown> : {};
  const group = typeof firstInput.parallelGroup === "string" ? firstInput.parallelGroup : undefined; if (!group) return [first];
  const completedSequences = new Set(steps.filter(step => step.status === "COMPLETED").map(step => step.sequence).filter((value): value is number => typeof value === "number"));
  return pending.filter(step => { const input = step.input && typeof step.input === "object" ? step.input as Record<string, unknown> : {}; if (input.parallelGroup !== group) return false; const dependencies = Array.isArray(input.dependsOn) ? input.dependsOn.filter((value): value is number => Number.isInteger(value) && value > 0) : []; return dependencies.every(sequence => completedSequences.has(sequence)); }).slice(0, maxBatch);
}

export async function runAgentBrain(taskId: string, options: BrainRunOptions) {
  const maxCycles = Math.min(100, Math.max(1, options.maxCycles ?? 20)); const events: Array<Record<string, unknown>> = []; let replans = 0; let diagnosticEvidence: string | undefined; let recoveryStrategyHints: string | undefined; const failureFingerprints = new Set<string>();
  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    const task = await db.task.findFirst({ where: { id: taskId, userId: options.userId, tenantId: options.tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } }); if (!task) throw new Error("Task not found");
    if (task.status === "PLANNING") {
      const planningEvidence = [diagnosticEvidence, recoveryStrategyHints ? `Recommended historical strategies from recovery:\n${recoveryStrategyHints}` : undefined].filter(Boolean).join("\n\n") || undefined;
      await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "PLAN_CREATED", actor: "AGENT", summary: `Planning cycle ${cycle} started`, data: { cycle, hasDiagnosticEvidence: Boolean(planningEvidence), hasRecoveryStrategies: Boolean(recoveryStrategyHints) });
      const steps = await planToolSteps(task.goal, task.model ?? "mock:default", { userId: options.userId, tenantId: options.tenantId, projectId: task.projectId ?? undefined, diagnosticEvidence: planningEvidence }); if (steps.length > (task.maxSteps ?? 50)) throw new Error("Generated plan exceeds task step limit");
      if (steps.length === 0) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "TASK_FAILED", actor: "AGENT", summary: "No safe execution plan was generated", data: { cycle, reason: "NO_SAFE_PLAN" } }); return { status: "PAUSED", reason: "NO_SAFE_PLAN", cycles: cycle, events }; }
      await db.taskStep.deleteMany({ where: { taskId: task.id } }); await db.taskStep.createMany({ data: steps.map((step, index) => ({ taskId: task.id, sequence: index + 1, name: "TOOL", status: "PENDING" as const, input: { toolName: step.tool, input: step.input, reason: step.reason, parallelGroup: step.parallelGroup, dependsOn: step.dependsOn, planningCycle: cycle, priorFailureCount: failureFingerprints.size } })) }); await db.task.update({ where: { id: task.id }, data: { status: "WAITING_APPROVAL" } });
      events.push({ cycle, phase: "PLAN", steps: steps.length, approvalRequired: true, usedDiagnosticEvidence: Boolean(planningEvidence), usedRecoveryStrategies: Boolean(recoveryStrategyHints), distinctFailureCount: failureFingerprints.size }); return { status: "WAITING_APPROVAL", cycles: cycle, events };
    }
    if (["WAITING_APPROVAL", "PAUSED", "CANCELLED"].includes(task.status)) return { status: task.status, cycles: cycle - 1, events }; if (task.status !== "RUNNING") return { status: task.status, cycles: cycle - 1, events };

    const hasPending = task.steps.some(step => step.status === "PENDING");
    const batch = hasPending ? readyParallelBatch(task.steps, 4) : [];
    if (hasPending && batch.length === 0) return { status: "PAUSED", reason: "DEPENDENCY_DEADLOCK", cycles: cycle, events };
    const executionTargets: Array<PlannedStep | null> = hasPending ? batch : [null];
    await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "TOOL_REQUESTED", actor: "AGENT", summary: `Execution cycle ${cycle} started${executionTargets.length > 1 ? ` with ${executionTargets.length} parallel steps` : ""}`, data: { cycle, stepIds: executionTargets.map(step => step?.id).filter(Boolean), tools: executionTargets.map(step => step ? (step.input as Record<string, unknown> | null)?.toolName : "FINALIZE"), parallel: executionTargets.length > 1 } });
    const results = await Promise.all(executionTargets.map(step => executeNextTaskStep(task.id, options.userId, options.tenantId, options.role, step?.id)));
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]; const resultStatus = result && typeof result === "object" ? String((result as Record<string, unknown>).status ?? "UNKNOWN") : "UNKNOWN";
      events.push({ cycle, phase: "EXECUTE", result });
      await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: resultStatus === "FAILED" ? "TASK_FAILED" : "EXECUTION_FINISHED", actor: "AGENT", summary: `${executionTargets[index]?.id ?? "finalization"} finished with ${resultStatus}`, data: { cycle, stepId: executionTargets[index]?.id, status: resultStatus, verified: verifiedTaskResult(result), parallelBatchSize: executionTargets.length } });
    }
    const failedResult = results.find(result => result.status === "FAILED"); const approvalResult = results.find(result => result.status === "WAITING_APPROVAL");
    if (approvalResult) return { status: "WAITING_APPROVAL", cycles: cycle, events };
    if (failedResult) {
      diagnosticEvidence = diagnosticFromResult(failedResult); recoveryStrategyHints = strategyHints(failedResult); const fingerprint = failureFingerprint(failedResult);
      if (fingerprint && failureFingerprints.has(fingerprint)) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); events.push({ cycle, phase: "REPAIR_GUARD", reason: "REPEATED_FAILURE", fingerprint }); await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "TASK_FAILED", actor: "SYSTEM", summary: "Repeated failure detected; execution paused", data: { cycle, reason: "REPEATED_FAILURE", fingerprint } }); return { status: "PAUSED", reason: "REPEATED_FAILURE", cycles: cycle, events, replans, diagnosticEvidence: Boolean(diagnosticEvidence), usedRecoveryStrategies: Boolean(recoveryStrategyHints) }; }
      if (fingerprint) failureFingerprints.add(fingerprint);
      if (!options.replanOnFailure || replans >= Math.max(0, task.maxRetries ?? 0)) { await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "TASK_FAILED", actor: "AGENT", summary: "Task failed and retry policy was exhausted", data: { cycle, replans, fingerprint } }); return { status: "FAILED", cycles: cycle, events, replans, diagnosticEvidence: Boolean(diagnosticEvidence), usedRecoveryStrategies: Boolean(recoveryStrategyHints) }; }
      replans += 1; await db.task.update({ where: { id: task.id }, data: { status: "PLANNING" } }); events.push({ cycle, phase: "REPLAN", attempt: replans, reason: failedResult.error ?? "step failed", hasDiagnosticEvidence: Boolean(diagnosticEvidence), hasStrategyHints: Boolean(recoveryStrategyHints), failureFingerprint: fingerprint }); await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "REPAIR_STARTED", actor: "AGENT", summary: `Replanning after failure (attempt ${replans})`, data: { cycle, replans, fingerprint } }); continue;
    }
    if (results.some(result => result.status === "PAUSED" || result.status === "CANCELLED")) return { status: results.find(result => ["PAUSED", "CANCELLED"].includes(result.status))?.status ?? "PAUSED", cycles: cycle, events };
    if (results.some(result => result.status === "COMPLETED")) {
      const refreshed = await db.task.findFirst({ where: { id: task.id, userId: options.userId, tenantId: options.tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
      if (refreshed?.status === "COMPLETED") {
        const finalResult = results.find(result => result.status === "COMPLETED"); const verified = verifiedTaskResult(finalResult);
        await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "VERIFICATION_STARTED", actor: "SYSTEM", summary: "Final task verification started", data: { cycle } });
        const evaluation = evaluateAgentRun({ goal: refreshed.goal, completed: true, verified, recoveryCount: replans, repeatedFailure: false, toolErrors: events.filter(event => event.phase === "EXECUTE" && (event.result as Record<string, unknown> | undefined)?.status === "FAILED").length, evidenceCount: completedEvidenceCount(refreshed) });
        await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "VERIFICATION_FINISHED", actor: "SYSTEM", summary: verified ? "Task verification passed" : "Task completed without verified evidence", data: { cycle, verified, score: evaluation.score } });
        events.push({ cycle, phase: "EVALUATE", evaluation }); const experience = await learnFromCompletedExperience({ taskId: refreshed.id, tenantId: options.tenantId, userId: options.userId, projectId: refreshed.projectId, verified, evaluationScore: evaluation.score }); events.push({ cycle, phase: "LEARN", experience });
        await appendExecutionEvidence({ taskId: task.id, tenantId: options.tenantId, kind: "TASK_COMPLETED", actor: "AGENT", summary: "Universal task completed", data: { cycle, verified, evaluationScore: evaluation.score } }); return { status: "COMPLETED", cycles: cycle, events, evaluation, experience };
      }
    }
  }
  await appendExecutionEvidence({ taskId: taskId, tenantId: options.tenantId, kind: "TASK_FAILED", actor: "SYSTEM", summary: "Brain cycle limit reached", data: { maxCycles, replans } }); return { status: "PAUSED", reason: "BRAIN_CYCLE_LIMIT", cycles: maxCycles, events, replans };
}
