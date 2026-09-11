import type { CapabilityAgent, RoutedWorkItem } from "./capability-agent-router.js";
import { routeCapabilityAgent } from "./capability-agent-router.js";

export const UNIVERSAL_PROGRAMMING_LANGUAGES = ["C", "C++", "C#", "Dart", "Elixir", "Go", "Java", "JavaScript", "Kotlin", "Lua", "PHP", "Python", "R", "Ruby", "Rust", "Scala", "Swift", "TypeScript", "SQL", "Bash", "PowerShell", "HTML", "CSS", "Solidity", "Assembly"] as const;
export type UniversalModality = "TEXT" | "CODE" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "DATA" | "COMPUTER" | "WEB";
export type UniversalIntent = { goal: string; modalities: UniversalModality[]; languages: string[]; platform?: string };
export type UniversalPlan = { intent: UniversalIntent; primaryAgent: CapabilityAgent; workItems: RoutedWorkItem[]; executionWaves: string[][]; verificationRequired: true; executionRequired: boolean };

function unique(values: string[]): string[] { return [...new Set(values)]; }
function containsLanguage(goal: string, language: string): boolean {
  const escaped = language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(goal);
}

export function detectUniversalIntent(goal: string, platform = "GENERAL"): UniversalIntent {
  const text = `${goal} ${platform}`.toLowerCase();
  const modalities: UniversalModality[] = ["TEXT"];
  const languages: string[] = [];
  if (/code|coding|program|software|debug|compile|developer|script|function|class|algorithm|framework/.test(text)) modalities.push("CODE");
  if (/image|picture|illustration|graphic|logo|visual/.test(text)) modalities.push("IMAGE");
  if (/video|animation|film|reel|motion|storyboard/.test(text)) modalities.push("VIDEO");
  if (/audio|voice|speech|music|sound/.test(text)) modalities.push("AUDIO");
  if (/pdf|document|docx|report|presentation|spreadsheet/.test(text)) modalities.push("DOCUMENT");
  if (/data|dataset|analytics|statistics|database|sql/.test(text)) modalities.push("DATA");
  if (/browser|website|web|navigate|search online/.test(text)) modalities.push("WEB");
  if (/computer|desktop|click|ui automation|terminal/.test(text)) modalities.push("COMPUTER");
  for (const language of UNIVERSAL_PROGRAMMING_LANGUAGES) if (containsLanguage(goal, language)) languages.push(language);
  return { goal, modalities: unique(modalities) as UniversalModality[], languages, platform };
}

export function buildUniversalPlan(goal: string, platform = "GENERAL"): UniversalPlan {
  const intent = detectUniversalIntent(goal, platform);
  const primary = routeCapabilityAgent({ workItemId: "universal-root", capability: `${goal} ${intent.modalities.join(" ")}`, platform });
  const workItems: RoutedWorkItem[] = [{ ...primary, parallelGroup: "primary", expectedArtifacts: ["WORK_RESULT"] }];
  const add = (id: string, capability: string, target: string, group: string, dependsOn: string[] = []) => {
    const item = routeCapabilityAgent({ workItemId: id, capability, platform: target });
    workItems.push({ ...item, parallelGroup: group, dependsOn, expectedArtifacts: [target === "VERIFY" ? "VERIFICATION_REPORT" : "WORK_RESULT"] });
  };
  if (intent.modalities.includes("CODE") && primary.agent !== "CODE_AGENT") add("universal-code", goal, "CODE", "build", ["universal-root"]);
  if (intent.modalities.includes("IMAGE")) add("universal-image", goal, "IMAGE", "media", ["universal-root"]);
  if (intent.modalities.includes("VIDEO")) add("universal-video", goal, "VIDEO", "media", ["universal-root"]);
  if (intent.modalities.includes("AUDIO")) add("universal-audio", goal, "AUDIO", "media", ["universal-root"]);
  if (intent.modalities.includes("DOCUMENT")) add("universal-document", goal, "DOCUMENT", "artifact", ["universal-root"]);
  if (intent.modalities.includes("DATA")) add("universal-data", goal, "DATA", "analysis", ["universal-root"]);
  if (intent.modalities.includes("COMPUTER")) add("universal-computer", goal, "COMPUTER", "execution", ["universal-root"]);
  if (intent.modalities.includes("WEB")) add("universal-web", goal, "WEB", "execution", ["universal-root"]);
  add("universal-verify", `verify test validate ${goal}`, "VERIFY", "verification", workItems.filter(x => x.workItemId !== "universal-verify").map(x => x.workItemId));

  const executionWaves = [["universal-root"], ...[...new Set(workItems.filter(x => x.workItemId !== "universal-root" && x.workItemId !== "universal-verify").map(x => x.parallelGroup ?? x.workItemId))].map(group => workItems.filter(x => x.parallelGroup === group).map(x => x.workItemId)), ["universal-verify"]];
  return {
    intent,
    primaryAgent: primary.agent,
    workItems: workItems.filter((item, index, all) => all.findIndex(other => other.agent === item.agent && other.workItemId === item.workItemId) === index),
    executionWaves,
    verificationRequired: true,
    executionRequired: intent.modalities.some(modality => ["CODE", "COMPUTER", "WEB", "DATA"].includes(modality)),
  };
}
