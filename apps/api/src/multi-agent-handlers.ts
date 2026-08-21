import { runCodingVerification } from "./coding-agent.js";
import { diagnoseFailure } from "./debugger-agent.js";
import { fullReview } from "./full-reviewer.js";
import type { AgentHandlers } from "./multi-agent-orchestrator.js";

export function createEngineeringAgentHandlers(): AgentHandlers {
  return {
    CODER: async context => ({ agent: "CODER", status: "NEEDS_REVIEW", summary: "Coder execution adapter requires a repository workspace and change provider." }),
    DEBUGGER: async context => {
      const diagnosis = diagnoseFailure(context.request.task);
      return { agent: "DEBUGGER", status: diagnosis.retryable ? "SUCCESS" : "NEEDS_REVIEW", summary: diagnosis.summary, data: diagnosis };
    },
    REVIEWER: async context => ({ agent: "REVIEWER", status: "NEEDS_REVIEW", summary: "Reviewer execution adapter requires source files from the active workspace." }),
    GITHUB: async context => ({ agent: "GITHUB", status: "NEEDS_REVIEW", summary: "GitHub execution requires an explicit mutation request and approval." })
  };
}
