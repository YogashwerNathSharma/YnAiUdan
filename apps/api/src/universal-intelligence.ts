import type { CapabilityAgent, RoutedWorkItem } from "./capability-agent-router.js";
import { routeCapabilityAgent } from "./capability-agent-router.js";

export const UNIVERSAL_PROGRAMMING_LANGUAGES = [
  "C", "C++", "C#", "Dart", "Elixir", "Go", "Java", "JavaScript", "Kotlin", "Lua", "PHP", "Python", "R", "Ruby", "Rust", "Scala", "Swift", "TypeScript", "SQL", "Bash", "PowerShell", "HTML", "CSS", "Solidity", "Assembly"
] as const;

export type UniversalModality = "TEXT" | "CODE" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "DATA" | "COMPUTER" | "WEB";

export type UniversalIntent = {
  goal: string;
  modalities: UniversalModality[];
  languages: string[];
  platform?: string;
};

export type UniversalPlan = {
  intent: UniversalIntent;
  primaryAgent: CapabilityAgent;
  workItems: RoutedWorkItem[];
  verificationRequired: true;
  executionRequired: boolean;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

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

  for (const language of UNIVERSAL_PROGRAMMING_LANGUAGES) {
    if (containsLanguage(goal, language)) languages.push(language);
  }

  return { goal, modalities: unique(modalities) as UniversalModality[], languages, platform };
}

export function buildUniversalPlan(goal: string, platform = "GENERAL"): UniversalPlan {
  const intent = detectUniversalIntent(goal, platform);
  const primary = routeCapabilityAgent({ workItemId: "universal-root", capability: `${goal} ${intent.modalities.join(" ")}`, platform });
  const workItems: RoutedWorkItem[] = [primary];

  if (intent.modalities.includes("CODE") && primary.agent !== "CODE_AGENT") workItems.push(routeCapabilityAgent({ workItemId: "universal-code", capability: goal, platform: "CODE" }));
  if (intent.modalities.includes("IMAGE")) workItems.push(routeCapabilityAgent({ workItemId: "universal-image", capability: goal, platform: "IMAGE" }));
  if (intent.modalities.includes("VIDEO")) workItems.push(routeCapabilityAgent({ workItemId: "universal-video", capability: goal, platform: "VIDEO" }));
  if (intent.modalities.includes("AUDIO")) workItems.push(routeCapabilityAgent({ workItemId: "universal-audio", capability: goal, platform: "AUDIO" }));
  if (intent.modalities.includes("DOCUMENT")) workItems.push(routeCapabilityAgent({ workItemId: "universal-document", capability: goal, platform: "DOCUMENT" }));
  if (intent.modalities.includes("DATA")) workItems.push(routeCapabilityAgent({ workItemId: "universal-data", capability: goal, platform: "DATA" }));
  if (intent.modalities.includes("COMPUTER")) workItems.push(routeCapabilityAgent({ workItemId: "universal-computer", capability: goal, platform: "COMPUTER" }));
  if (intent.modalities.includes("WEB")) workItems.push(routeCapabilityAgent({ workItemId: "universal-web", capability: goal, platform: "WEB" }));
  workItems.push(routeCapabilityAgent({ workItemId: "universal-verify", capability: `verify test validate ${goal}`, platform: "VERIFY" }));

  return {
    intent,
    primaryAgent: primary.agent,
    workItems: workItems.filter((item, index, all) => all.findIndex(other => other.agent === item.agent && other.workItemId === item.workItemId) === index),
    verificationRequired: true,
    executionRequired: intent.modalities.some(modality => ["CODE", "COMPUTER", "WEB", "DATA"].includes(modality)),
  };
}
