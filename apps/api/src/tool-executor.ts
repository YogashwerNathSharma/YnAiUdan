import { toolRegistry } from "./tools.js";
import { canRunTool, type AutonomyMode } from "./permissions.js";

export type ToolExecutionResult = { ok: true; tool: string; output: unknown } | { ok: false; tool: string; error: string; requiresApproval?: boolean };

export async function executeTool(params: { toolName: string; input: unknown; role: string; mode: AutonomyMode }): Promise<ToolExecutionResult> {
  const tool = toolRegistry.get(params.toolName);
  if (!tool) return { ok: false, tool: params.toolName, error: "Tool not found" };
  if (!canRunTool(params.role, params.toolName, params.mode)) {
    return { ok: false, tool: params.toolName, error: "Tool execution is not permitted in the current autonomy mode or role", requiresApproval: tool.risk !== "LOW" };
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
