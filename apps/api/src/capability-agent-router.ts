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

export type RoutedWorkItem = { workItemId: string; agent: CapabilityAgent; reason: string };

export function routeCapabilityAgent(input: { workItemId: string; capability: string; platform: string }): RoutedWorkItem {
  const text = `${input.capability} ${input.platform}`.toLowerCase();

  if (/orchestrat|multi.?agent|break.?down|plan.*task|coordinate/.test(text)) return { workItemId: input.workItemId, agent: "ORCHESTRATOR_AGENT", reason: "Complex work requires coordinated planning and specialist agents." };
  if (/refactor|restructure|migration|migrate/.test(text)) return { workItemId: input.workItemId, agent: "REFACTOR_AGENT", reason: "Change-oriented capability requires controlled transformation." };
  if (/verify|test|qa|quality|compile|lint|regression|benchmark/.test(text)) return { workItemId: input.workItemId, agent: "VERIFY_AGENT", reason: "Verification capability requires independent validation and evidence." };
  if (/image|illustration|graphic|visual|picture/.test(text) || input.platform === "IMAGE") return { workItemId: input.workItemId, agent: "IMAGE_AGENT", reason: "Capability requires image understanding or generation." };
  if (/video|animation|storyboard|motion|film/.test(text) || input.platform === "VIDEO") return { workItemId: input.workItemId, agent: "VIDEO_AGENT", reason: "Capability requires video or motion-media generation." };
  if (/audio|voice|speech|sound|music/.test(text) || input.platform === "AUDIO") return { workItemId: input.workItemId, agent: "AUDIO_AGENT", reason: "Capability requires audio or speech processing." };
  if (/document|pdf|docx|report|presentation|spreadsheet/.test(text) || /DOCUMENT|PDF|DOCX|PRESENTATION|SPREADSHEET/.test(input.platform)) return { workItemId: input.workItemId, agent: "DOCUMENT_AGENT", reason: "Capability targets document or office artifacts." };
  if (/research|search|source|citation|investigat/.test(text)) return { workItemId: input.workItemId, agent: "RESEARCH_AGENT", reason: "Capability requires research and source synthesis." };
  if (/browser|computer|desktop|click|navigate|ui automation/.test(text) || input.platform === "COMPUTER") return { workItemId: input.workItemId, agent: "COMPUTER_AGENT", reason: "Capability requires controlled computer interaction." };
  if (/data|analytics|analysis|dataset|sql|statistics|visuali[sz]e data/.test(text) || input.platform === "DATA") return { workItemId: input.workItemId, agent: "DATA_AGENT", reason: "Capability requires data analysis or transformation." };
  if (/language|translate|translation|grammar|multilingual|programming language|compiler|syntax/.test(text)) return { workItemId: input.workItemId, agent: "LANGUAGE_AGENT", reason: "Capability requires language or language-runtime understanding." };
  if (/code|coding|program|software|debug|implement|function|class|algorithm|framework|library|sdk/.test(text)) return { workItemId: input.workItemId, agent: "CODE_AGENT", reason: "Capability requires general software engineering." };
  if (input.platform === "ANDROID") return { workItemId: input.workItemId, agent: "ANDROID_BUILDER", reason: "Target platform is Android." };
  if (input.platform === "WEB") return { workItemId: input.workItemId, agent: "WEB_BUILDER", reason: "Target platform is Web." };
  if (input.platform === "API") return { workItemId: input.workItemId, agent: "API_BUILDER", reason: "Target platform is API/backend." };
  if (/database|schema|table/.test(text)) return { workItemId: input.workItemId, agent: "DATABASE_BUILDER", reason: "Capability targets persistent data architecture." };

  return { workItemId: input.workItemId, agent: "ORCHESTRATOR_AGENT", reason: "General-purpose work is routed to the universal orchestrator for capability decomposition." };
}

export function routeBuildWork(items: Array<{ id: string; capability: string; platform: string }>): RoutedWorkItem[] {
  return items.map(item => routeCapabilityAgent({ workItemId: item.id, capability: item.capability, platform: item.platform }));
}
