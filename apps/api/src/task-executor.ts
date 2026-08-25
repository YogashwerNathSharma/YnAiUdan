import { db } from "./db.js";
import { executeTool } from "./tool-executor.js";
import { saveTaskMemory } from "./memory-service.js";
import { recordLearning } from "./learning-service.js";

function compactMemoryValue(value: unknown): string { try { const text = typeof value === "string" ? value : JSON.stringify(value); return text.slice(0, 9000); } catch { return String(value).slice(0, 9000); } }
async function persistExecutionMemory(task: { id: string; tenantId: string; userId: string; projectId: string | null; title: string; goal: string }, input: { toolName: string; input?: unknown }, result: { ok: boolean; output?: unknown; error?: string; tool?: string }) {
  const toolName = result.tool ?? input.toolName; const status = result.ok ? "SUCCESS" : "FAILURE";
  const value = result.ok ? `Task: ${task.title}\nGoal: ${task.goal}\nTool: ${toolName}\nInput: ${compactMemoryValue(input.input)}\nResult: ${compactMemoryValue(result.output)}` : `Task: ${task.title}\nGoal: ${task.goal}\nTool: ${toolName}\nInput: ${compactMemoryValue(input.input)}\nFailure: ${result.error ?? "Unknown tool failure"}`;
  await saveTaskMemory({ tenantId: task.tenantId, userId: task.userId, projectId: task.projectId ?? undefined, taskId: task.id, key: `tool:${toolName}:${status.toLowerCase()}`, value, importance: result.ok ? 0.75 : 0.85 });
}
async function captureLearning(task: { tenantId: string; userId: string; projectId: string | null; goal: string }, input: { toolName: string; input?: unknown }, result: { ok: boolean; output?: unknown; error?: string; tool?: string }, verification?: unknown) {
  const tool = result.tool ?? input.toolName;
  await recordLearning({
    tenantId: task.tenantId, userId: task.userId, projectId: task.projectId ?? undefined, query: task.goal,
    kind: result.ok ? "SOLUTION" : "MISTAKE", solution: result.ok ? `Tool ${tool} succeeded. Result: ${compactMemoryValue(result.output)}` : undefined,
    mistake: result.ok ? undefined : `Tool ${tool} failed: ${result.error ?? "Unknown failure"}`,
    rootCause: result.ok ? undefined : "Execution failure; root cause requires subsequent analysis",
    verification: compactMemoryValue(verification ?? (result.ok ? result.output : result.error)), verified: result.ok,
    confidence: result.ok ? 0.9 : 0.35
  }).catch(() => undefined);
}
function evidenceObject(output: unknown): Record<string, unknown> | undefined { if (!output || typeof output !== "object") return undefined; const evidence = (output as Record<string, unknown>).evidence; return evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : undefined; }
function verifiedGitHubWrite(toolName: string, output: unknown): boolean { if (!["github.commit", "github.push"].includes(toolName)) return true; return evidenceObject(output)?.verified === true; }
function verifiedCI(toolName: string, output: unknown): boolean { if (toolName !== "github.ci_status") return true; const evidence = evidenceObject(output); return evidence?.type === "GITHUB_COMMIT_STATUS" && output && typeof output === "object" && (output as Record<string, unknown>).status === "SUCCESS"; }
function verificationSummary(toolName: string, output: unknown): Record<string, unknown> { const evidence = evidenceObject(output); if (!evidence) return { verified: false, reason: "NO_EVIDENCE" }; if (toolName === "github.ci_status") return { verified: (output as Record<string, unknown>).status === "SUCCESS", type: evidence.type, commitSha: evidence.commitSha, state: evidence.state }; return { verified: evidence.verified === true, type: evidence.type, commitSha: evidence.commitSha, files: evidence.files }; }
function finalVerificationForPlan(taskSteps: Array<{ name: string; status: string; output?: unknown }>): { verified: boolean; reason: string; evidence: unknown[] } { const completed = taskSteps.filter(step => step.status === "COMPLETED"); const writeEvidence = completed.filter(step => { const output = step.output as Record<string, unknown> | undefined; const result = output?.result; return result && typeof result === "object" && (result as Record<string, unknown>).evidence && ["github.commit", "github.push"].includes(String((result as Record<string, unknown>).tool ?? "")); }); const ciEvidence = completed.filter(step => { const output = step.output as Record<string, unknown> | undefined; const result = output?.result; return result && typeof result === "object" && ["SUCCESS"].includes(String((result as Record<string, unknown>).status ?? "")); }); if (writeEvidence.length === 0 && ciEvidence.length === 0) return { verified: true, reason: "NO_GITHUB_VERIFICATION_REQUIRED", evidence: [] }; const evidence = [...writeEvidence, ...ciEvidence].map(step => step.output); return { verified: writeEvidence.length > 0 && ciEvidence.length > 0, reason: writeEvidence.length > 0 && ciEvidence.length > 0 ? "READ_BACK_AND_CI_VERIFIED" : "MISSING_READ_BACK_OR_CI", evidence }; }

export async function executeNextTaskStep(taskId: string, userId: string, tenantId: string, role: string) {
  const task = await db.task.findFirst({ where: { id: taskId, userId, tenantId }, include: { steps: { orderBy: { sequence: "asc" } } } });
  if (!task) throw new Error("Task not found");
  if (task.status !== "RUNNING") throw new Error(`Task is not executable in ${task.status} state`);
  const completed = task.steps.filter(step => step.status === "COMPLETED").length;
  if (task.maxSteps !== null && completed >= task.maxSteps) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); return { status: "PAUSED", reason: "MAX_STEPS_REACHED" }; }
  const completedToolCalls = task.steps.filter(step => step.name === "TOOL" && step.status === "COMPLETED").length;
  if (task.maxToolCalls !== null && completedToolCalls >= task.maxToolCalls) { await db.task.update({ where: { id: task.id }, data: { status: "PAUSED" } }); return { status: "PAUSED", reason: "MAX_TOOL_CALLS_REACHED" }; }
  const pending = task.steps.find(candidate => candidate.status === "PENDING");
  if (!pending) { const finalVerification = finalVerificationForPlan(task.steps); if (!finalVerification.verified) { await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } }); return { status: "FAILED", reason: "FINAL_VERIFICATION_FAILED", verification: finalVerification }; } await db.task.update({ where: { id: task.id }, data: { status: "COMPLETED" } }); return { status: "COMPLETED", verification: finalVerification }; }
  const claimed = await db.taskStep.updateMany({ where: { id: pending.id, taskId: task.id, status: "PENDING" }, data: { status: "RUNNING", startedAt: new Date() } });
  if (claimed.count !== 1) return { status: "RUNNING", reason: "STEP_ALREADY_CLAIMED", stepId: pending.id };
  const step = pending;
  if (step.name !== "TOOL") { await db.taskStep.update({ where: { id: step.id }, data: { status: "COMPLETED", completedAt: new Date(), output: { acknowledged: true } } }); return { status: "COMPLETED", stepId: step.id, next: true }; }
  const input = (step.input ?? {}) as { toolName?: string; input?: unknown; approvalGranted?: boolean };
  if (!input.toolName) { await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: "Tool step is missing toolName", completedAt: new Date() } }); return { status: "FAILED", stepId: step.id, error: "Tool step is missing toolName" }; }
  const result = await executeTool({ toolName: input.toolName, input: input.input, tenantId: task.tenantId, role, mode: task.autonomyMode, approvalGranted: input.approvalGranted === true });
  if (result.ok) {
    const verified = verifiedGitHubWrite(input.toolName, result.output) && verifiedCI(input.toolName, result.output);
    if (!verified) { const reason = input.toolName === "github.ci_status" ? "CI did not reach SUCCESS" : "Repository write completed without verified read-back evidence"; const verification = verificationSummary(input.toolName, result.output); await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: reason, completedAt: new Date(), output: { result: result.output, verification } } }); await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } }); await persistExecutionMemory(task, input as { toolName: string; input?: unknown }, { ok: false, tool: input.toolName, error: reason }); await captureLearning(task, input as { toolName: string; input?: unknown }, { ok: false, tool: input.toolName, error: reason }, verification); return { status: "FAILED", stepId: step.id, tool: input.toolName, error: reason, verification }; }
    const verification = verificationSummary(input.toolName, result.output); await db.taskStep.update({ where: { id: step.id }, data: { status: "COMPLETED", output: { result: result.output, verification }, completedAt: new Date() } }); await persistExecutionMemory(task, input as { toolName: string; input?: unknown }, result); await captureLearning(task, input as { toolName: string; input?: unknown }, result, verification); return { status: "COMPLETED", stepId: step.id, tool: result.tool, output: result.output, verification };
  }
  if (result.requiresApproval) { await db.taskStep.update({ where: { id: step.id }, data: { status: "PENDING", startedAt: null } }); await db.task.update({ where: { id: task.id }, data: { status: "WAITING_APPROVAL" } }); return { status: "WAITING_APPROVAL", stepId: step.id, tool: result.tool, error: result.error }; }
  await db.taskStep.update({ where: { id: step.id }, data: { status: "FAILED", error: result.error, completedAt: new Date() } }); await db.task.update({ where: { id: task.id }, data: { status: "FAILED" } }); await persistExecutionMemory(task, input as { toolName: string; input?: unknown }, result); await captureLearning(task, input as { toolName: string; input?: unknown }, result); return { status: "FAILED", stepId: step.id, tool: result.tool, error: result.error };
}
