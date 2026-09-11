import { toolRegistry } from "./tools.js";
import { canRunTool, hasPermission, normalizeAutonomyMode, requiresApproval, type AutonomyMode } from "./permissions.js";
import { validateAgentTool, type CapabilityAgent } from "./agent-fabric.js";

export type ToolExecutionResult = { ok: true; tool: string; output: unknown } | { ok: false; tool: string; error: string; requiresApproval?: boolean };

function extractAgentRouting(input: unknown): { agent?: CapabilityAgent; workItemId?: string; cleanInput: unknown } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { cleanInput: input };
  const source = input as Record<string, unknown>;
  const agent = typeof source.__agent === "string" ? source.__agent as CapabilityAgent : undefined;
  const workItemId = typeof source.__workItemId === "string" ? source.__workItemId : undefined;
  if (!agent && !workItemId) return { cleanInput: input };
  const clean = { ...source };
  delete clean.__agent;
  delete clean.__workItemId;
  return { agent, workItemId, cleanInput: clean };
}

export async function executeTool(params: { toolName: string; input: unknown; tenantId?: string; role: string; mode: AutonomyMode | string; approvalGranted?: boolean }): Promise<ToolExecutionResult> {
  const tool = toolRegistry.get(params.toolName);
  if (!tool) return { ok: false, tool: params.toolName, error: "Tool not found" };
  const routing = extractAgentRouting(params.input);
  if (routing.agent && !routing.workItemId) return { ok: false, tool: params.toolName, error: "Specialist routing requires a workItemId" };
  if (routing.agent && !validateAgentTool(routing.agent, params.toolName)) return { ok: false, tool: params.toolName, error: `${params.toolName} is not compatible with ${routing.agent}` };
  let mode: AutonomyMode;
  try { mode = normalizeAutonomyMode(params.mode); } catch { return { ok: false, tool: params.toolName, error: "Invalid autonomy mode" }; }
  const granted = params.approvalGranted === true;
  const permitted = tool.permissions.every(permission => hasPermission(params.role, permission));
  if (!permitted) return { ok: false, tool: params.toolName, error: "Tool execution is not permitted for the current role" };
  if (!canRunTool(params.role, params.toolName, mode, granted)) return { ok: false, tool: params.toolName, error: "Tool execution requires approval in the current autonomy mode", requiresApproval: requiresApproval(tool.risk, mode) };
  const tenantScopedTool = (params.toolName === "workspace.write" || params.toolName === "terminal.execute") && Boolean(params.tenantId);
  const baseInput = routing.cleanInput as Record<string, unknown>;
  const toolInput = tenantScopedTool ? { ...baseInput, tenantId: params.tenantId } : baseInput;
  const parsed = tool.inputSchema.safeParse(toolInput);
  if (!parsed.success) return { ok: false, tool: params.toolName, error: "Invalid tool input" };
  try {
    const output = await Promise.race([tool.execute(parsed.data), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Tool timeout")), tool.timeoutMs))]);
    if (routing.agent && output && typeof output === "object") return { ok: true, tool: params.toolName, output: { ...(output as Record<string, unknown>), agent: routing.agent, workItemId: routing.workItemId } };
    return { ok: true, tool: params.toolName, output };
  } catch (error) {
    return { ok: false, tool: params.toolName, error: error instanceof Error ? error.message : "Tool execution failed" };
  }
}
