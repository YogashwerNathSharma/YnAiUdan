import { toolRegistry } from "./tools.js";
import { canRunTool, hasPermission, normalizeAutonomyMode, requiresApproval, type AutonomyMode } from "./permissions.js";

export type ToolExecutionResult = { ok: true; tool: string; output: unknown } | { ok: false; tool: string; error: string; requiresApproval?: boolean };

export async function executeTool(params: { toolName: string; input: unknown; tenantId?: string; role: string; mode: AutonomyMode | string; approvalGranted?: boolean }): Promise<ToolExecutionResult> {
  const tool = toolRegistry.get(params.toolName);
  if (!tool) return { ok: false, tool: params.toolName, error: "Tool not found" };
  let mode: AutonomyMode;
  try { mode = normalizeAutonomyMode(params.mode); } catch { return { ok: false, tool: params.toolName, error: "Invalid autonomy mode" }; }
  const granted = params.approvalGranted === true;
  if (!canRunTool(params.role, params.toolName, mode, granted)) {
    const permitted = tool.permissions.every(permission => hasPermission(params.role, permission));
    if (!permitted) return { ok: false, tool: params.toolName, error: "Tool execution is not permitted for the current role" };
    return { ok: false, tool: params.toolName, error: "Tool execution requires approval in the current autonomy mode", requiresApproval: requiresApproval(tool.risk, mode) };
  }
  const toolInput = params.toolName === "workspace.write" && params.tenantId
    ? { ...(params.input as Record<string, unknown>), tenantId: params.tenantId }
    : params.input;
  const parsed = tool.inputSchema.safeParse(toolInput);
  if (!parsed.success) return { ok: false, tool: params.toolName, error: "Invalid tool input" };
  try {
    const output = await Promise.race([
      tool.execute(parsed.data),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Tool timeout")), tool.timeoutMs))
    ]);
    return { ok: true, tool: params.toolName, output };
  } catch (error) {
    return { ok: false, tool: params.toolName, error: error instanceof Error ? error.message : "Tool execution failed" };
  }
}
