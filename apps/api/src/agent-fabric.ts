import type { CapabilityAgent, RoutedWorkItem } from "./capability-agent-router.js";

export type AgentAssignment = {
  agent: CapabilityAgent;
  workItemId: string;
  reason: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  dependsOn: string[];
  parallelGroup?: string;
  expectedArtifacts: string[];
};

export type AgentEnvelope = {
  taskId: string;
  tenantId: string;
  workItemId: string;
  agent: CapabilityAgent;
  goal: string;
  status: "READY" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";
  input: Record<string, unknown>;
  output?: unknown;
  evidence?: Record<string, unknown>;
};

const CAPABILITY_TOOLS: Record<CapabilityAgent, RegExp> = {
  ORCHESTRATOR_AGENT: /plan|orchestrat|coordinate|decompose/i,
  CODE_AGENT: /code|coding|workspace|terminal|compile|debug|program|github/i,
  LANGUAGE_AGENT: /language|translate|grammar|speech|syntax/i,
  RESEARCH_AGENT: /research|search|source|citation|web/i,
  COMPUTER_AGENT: /computer|browser|desktop|click|navigate|terminal/i,
  DATA_AGENT: /data|analytics|dataset|sql|statistics|database/i,
  DOCUMENT_AGENT: /document|pdf|docx|report|presentation|spreadsheet/i,
  AUDIO_AGENT: /audio|voice|speech|music|sound/i,
  WEB_BUILDER: /web|website|frontend|html|css/i,
  ANDROID_BUILDER: /android|apk|mobile/i,
  API_BUILDER: /api|rest|graphql|backend|endpoint/i,
  DATABASE_BUILDER: /database|schema|migration|table/i,
  IMAGE_AGENT: /image|picture|illustration|graphic|logo|visual/i,
  VIDEO_AGENT: /video|animation|film|reel|motion|storyboard/i,
  REFACTOR_AGENT: /refactor|restructure|migration|migrate/i,
  VERIFY_AGENT: /verify|test|qa|quality|compile|lint|regression|benchmark|ci/i,
};

export function buildAgentAssignments(workItems: RoutedWorkItem[]): AgentAssignment[] {
  return workItems.map(item => ({
    agent: item.agent,
    workItemId: item.workItemId,
    reason: item.reason,
    risk: item.risk ?? "MEDIUM",
    dependsOn: item.dependsOn ?? [],
    parallelGroup: item.parallelGroup,
    expectedArtifacts: item.expectedArtifacts ?? [],
  }));
}

export function validateAgentTool(agent: CapabilityAgent, toolName: string): boolean {
  if (agent === "ORCHESTRATOR_AGENT") return true;
  return CAPABILITY_TOOLS[agent]?.test(toolName) ?? false;
}

export function validateAgentAssignment(assignment: AgentAssignment, toolName: string): { valid: boolean; reason?: string } {
  if (!validateAgentTool(assignment.agent, toolName)) {
    return { valid: false, reason: `${toolName} is not compatible with ${assignment.agent}` };
  }
  return { valid: true };
}

export function createAgentEnvelope(input: Omit<AgentEnvelope, "status"> & { status?: AgentEnvelope["status"] }): AgentEnvelope {
  return { ...input, status: input.status ?? "READY" };
}
