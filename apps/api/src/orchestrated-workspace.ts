import { applyWorkspaceChanges, type SharedWorkspace } from "./workspace-context.js";
import { runMultiAgentOrchestrator, type AgentHandlers, type MultiAgentRequest, type AgentOutcome } from "./multi-agent-orchestrator.js";

export type WorkspaceAgentContext = { workspace: SharedWorkspace; request: MultiAgentRequest; history: AgentOutcome[] };
export type WorkspaceAgentHandlers = Partial<Record<"CODER" | "DEBUGGER" | "REVIEWER" | "GITHUB", (context: WorkspaceAgentContext) => Promise<AgentOutcome & { changes?: SharedWorkspace["changes"] }>>>;

export async function runWorkspaceOrchestration(workspace: SharedWorkspace, request: MultiAgentRequest, handlers: WorkspaceAgentHandlers) {
  let current = workspace;
  const history: AgentOutcome[] = [];
  const adapted: AgentHandlers = {};
  for (const agent of ["CODER", "DEBUGGER", "REVIEWER", "GITHUB"] as const) {
    const handler = handlers[agent];
    if (!handler) continue;
    adapted[agent] = async context => {
      const result = await handler({ workspace: current, request, history });
      if (result.changes?.length) current = applyWorkspaceChanges(current, result.changes);
      history.push(result);
      return result;
    };
  }
  const result = await runMultiAgentOrchestrator(request, adapted);
  return { ...result, workspace: current };
}
