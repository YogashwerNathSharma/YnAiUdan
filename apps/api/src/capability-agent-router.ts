export type CapabilityAgent =
  | "ORCHESTRATOR_AGENT"
  | "CODE_AGENT"
  | "LANGUAGE_AGENT"
  | "RESEARCH_AGENT"
  | "COMPUTER_AGENT"
  | "DATA_AGENT"
  | "DOCUMENT_AGENT"
  | "AUDIO_AGENT"
  | "WEB_BUILDER"
  | "ANDROID_BUILDER"
  | "API_BUILDER"
  | "DATABASE_BUILDER"
  | "IMAGE_AGENT"
  | "VIDEO_AGENT"
  | "REFACTOR_AGENT"
  | "VERIFY_AGENT";

export type WorkRisk = "LOW" | "MEDIUM" | "HIGH";
export type RoutedWorkItem = {
  workItemId: string;
  agent: CapabilityAgent;
  reason: string;
  dependsOn?: string[];
  parallelGroup?: string;
  risk?: WorkRisk;
  expectedArtifacts?: string[];
};

export function routeCapabilityAgent(input: { workItemId: string; capability: string; platform: string }): RoutedWorkItem {
  const text = `${input.capability} ${input.platform}`.toLowerCase();
  const base = (agent: CapabilityAgent, reason: string, risk: WorkRisk = "MEDIUM"): RoutedWorkItem => ({ workItemId: input.workItemId, agent, reason, risk });

  if (/orchestrat|multi.?agent|break.?down|plan.*task|coordinate/.test(text)) return base("ORCHESTRATOR_AGENT", "Complex work requires coordinated planning and specialist agents.", "LOW");
  if (/refactor|restructure|migration|migrate/.test(text)) return base("REFACTOR_AGENT", "Change-oriented capability requires controlled transformation.", "HIGH");
  if (/verify|test|qa|quality|compile|lint|regression|benchmark/.test(text)) return base("VERIFY_AGENT", "Verification capability requires independent validation and evidence.", "LOW");
  if (/image|illustration|graphic|visual|picture/.test(text) || input.platform === "IMAGE") return base("IMAGE_AGENT", "Capability requires image understanding or generation.", "LOW");
  if (/video|animation|storyboard|motion|film/.test(text) || input.platform === "VIDEO") return base("VIDEO_AGENT", "Capability requires video or motion-media generation.", "LOW");
  if (/audio|voice|speech|sound|music/.test(text) || input.platform === "AUDIO") return base("AUDIO_AGENT", "Capability requires audio or speech processing.", "LOW");
  if (/document|pdf|docx|report|presentation|spreadsheet/.test(text) || /DOCUMENT|PDF|DOCX|PRESENTATION|SPREADSHEET/.test(input.platform)) return base("DOCUMENT_AGENT", "Capability targets document or office artifacts.", "LOW");
  if (/research|search|source|citation|investigat/.test(text)) return base("RESEARCH_AGENT", "Capability requires research and source synthesis.", "LOW");
  if (/browser|computer|desktop|click|navigate|ui automation/.test(text) || input.platform === "COMPUTER") return base("COMPUTER_AGENT", "Capability requires controlled computer interaction.", "HIGH");
  if (/data|analytics|analysis|dataset|sql|statistics|visuali[sz]e data/.test(text) || input.platform === "DATA") return base("DATA_AGENT", "Capability requires data analysis or transformation.", "MEDIUM");
  if (/language|translate|translation|grammar|multilingual|programming language|compiler|syntax/.test(text)) return base("LANGUAGE_AGENT", "Capability requires language or language-runtime understanding.", "LOW");
  if (/code|coding|program|software|debug|implement|function|class|algorithm|framework|library|sdk/.test(text)) return base("CODE_AGENT", "Capability requires general software engineering.", "HIGH");
  if (input.platform === "ANDROID") return base("ANDROID_BUILDER", "Target platform is Android.", "HIGH");
  if (input.platform === "WEB") return base("WEB_BUILDER", "Target platform is Web.", "HIGH");
  if (input.platform === "API") return base("API_BUILDER", "Target platform is API/backend.", "HIGH");
  if (/database|schema|table/.test(text)) return base("DATABASE_BUILDER", "Capability targets persistent data architecture.", "HIGH");

  return base("ORCHESTRATOR_AGENT", "General-purpose work is routed to the universal orchestrator for capability decomposition.", "LOW");
}

export function routeBuildWork(items: Array<{ id: string; capability: string; platform: string }>): RoutedWorkItem[] {
  return items.map(item => routeCapabilityAgent({ workItemId: item.id, capability: item.capability, platform: item.platform }));
}
