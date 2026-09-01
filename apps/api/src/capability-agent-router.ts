export type CapabilityAgent = "WEB_BUILDER" | "ANDROID_BUILDER" | "API_BUILDER" | "DATABASE_BUILDER" | "IMAGE_AGENT" | "VIDEO_AGENT" | "REFACTOR_AGENT" | "VERIFY_AGENT";

export type RoutedWorkItem = { workItemId: string; agent: CapabilityAgent; reason: string };

export function routeCapabilityAgent(input: { workItemId: string; capability: string; platform: string }): RoutedWorkItem {
  const text = `${input.capability} ${input.platform}`.toLowerCase();
  if (/refactor|restructure|migration|migrate/.test(text)) return { workItemId: input.workItemId, agent: "REFACTOR_AGENT", reason: "Change-oriented capability requires controlled transformation." };
  if (/verify|test|qa|quality/.test(text)) return { workItemId: input.workItemId, agent: "VERIFY_AGENT", reason: "Verification capability requires independent validation." };
  if (input.platform === "ANDROID") return { workItemId: input.workItemId, agent: "ANDROID_BUILDER", reason: "Target platform is Android." };
  if (input.platform === "WEB") return { workItemId: input.workItemId, agent: "WEB_BUILDER", reason: "Target platform is Web." };
  if (input.platform === "API") return { workItemId: input.workItemId, agent: "API_BUILDER", reason: "Target platform is API/backend." };
  if (input.platform === "IMAGE") return { workItemId: input.workItemId, agent: "IMAGE_AGENT", reason: "Capability requires image generation." };
  if (input.platform === "VIDEO") return { workItemId: input.workItemId, agent: "VIDEO_AGENT", reason: "Capability requires video/media generation." };
  if (/database|schema|table|migration/.test(text)) return { workItemId: input.workItemId, agent: "DATABASE_BUILDER", reason: "Capability targets persistent data architecture." };
  return { workItemId: input.workItemId, agent: "VERIFY_AGENT", reason: "No specialized builder matched; route conservatively for validation." };
}

export function routeBuildWork(items: Array<{ id: string; capability: string; platform: string }>): RoutedWorkItem[] {
  return items.map(item => routeCapabilityAgent({ workItemId: item.id, capability: item.capability, platform: item.platform }));
}
