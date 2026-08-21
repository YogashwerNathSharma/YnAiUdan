export type AgentName = "CODER" | "DEBUGGER" | "REVIEWER" | "GITHUB";
export type AgentOutcome = { agent: AgentName; status: "SUCCESS" | "FAILED" | "NEEDS_REVIEW"; summary: string; data?: unknown };
export type MultiAgentRequest = { task: string; tenantId: string; userId: string; role: string; maxAgentSteps?: number };
export type MultiAgentContext = { request: MultiAgentRequest; history: AgentOutcome[] };

export type AgentHandlers = Partial<Record<AgentName, (context: MultiAgentContext) => Promise<AgentOutcome>>>;

const route = (task: string): AgentName[] => {
  const text = task.toLowerCase();
  if (/(bug|error|failing|broken|exception)/.test(text)) return ["DEBUGGER", "REVIEWER", "GITHUB"];
  if (/(review|audit|security|quality)/.test(text)) return ["REVIEWER"];
  if (/(github|pull request|pr|commit|branch)/.test(text)) return ["GITHUB"];
  return ["CODER", "REVIEWER", "GITHUB"];
};

export async function runMultiAgentOrchestrator(request: MultiAgentRequest, handlers: AgentHandlers): Promise<{ status: "SUCCESS" | "FAILED" | "NEEDS_REVIEW"; route: AgentName[]; history: AgentOutcome[] }> {
  const routePlan = route(request.task);
  const max = Math.min(routePlan.length, Math.max(1, request.maxAgentSteps ?? routePlan.length));
  const context: MultiAgentContext = { request, history: [] };
  for (const agent of routePlan.slice(0, max)) {
    const handler = handlers[agent];
    if (!handler) {
      context.history.push({ agent, status: "NEEDS_REVIEW", summary: `No handler configured for ${agent}.` });
      return { status: "NEEDS_REVIEW", route: routePlan, history: context.history };
    }
    const outcome = await handler(context);
    context.history.push(outcome);
    if (outcome.status !== "SUCCESS") return { status: outcome.status, route: routePlan, history: context.history };
  }
  return { status: "SUCCESS", route: routePlan, history: context.history };
}
