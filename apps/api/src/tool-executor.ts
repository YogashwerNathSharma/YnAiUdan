import { toolRegistry } from "./tools.js";
import { canRunTool, normalizeAutonomyMode, requiresApproval, type AutonomyMode } from "./permissions.js";

export type ToolExecutionResult = { ok: true; tool: string; output: unknown } | { ok: false; tool: string; error: string; requiresApproval?: boolean };

export async function executeTool(params: { toolName: string; input: unknown; role: string; mode: AutonomyMode | string; approvalGranted?: boolean }): Promise<ToolExecutionResult> {
  const tool = toolRegistry.get(params.toolName);
  if (!tool) return { ok: false, tool: params.toolName, error: "Tool not found" };
  let mode: AutonomyMode;
  try { mode = normalizeAutonomyMode(params.mode); } catch { return { ok: false, tool: params.toolName, error: "Invalid autonomy mode" }; }
  const granted = params.approvalGranted === true;
  if (!canRunTool(params.role, params.toolName, mode, granted)) {
    const permitted = tool.permissions.every(permission => {
      const roleMap: Record<string, string[]> = { OWNER: ["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "GITHUB_PUSH", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE", "DEPLOY", "PRODUCTION_ACCESS"], ADMIN: ["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE"], DEVELOPER: ["FILE_READ", "FILE_WRITE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE"], USER: ["FILE_READ", "GITHUB_READ", "GOOGLE_READ"], AGENT: ["FILE_READ", "GITHUB_READ"] };
      return roleMap[params.role]?.includes(permission) ?? false;
    });
    if (!permitted) return { ok: false, tool: params.toolName, error: "Tool execution is not permitted for the current role" };
    return { ok: false, tool: params.toolName, error: "Tool execution requires approval in the current autonomy mode", requiresApproval: requiresApproval(tool.risk, mode) };
  }
  const parsed = tool.inputSchema.safeParse(params.input);
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
