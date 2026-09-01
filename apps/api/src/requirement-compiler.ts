import type { ProjectConstitution } from "./project-constitution.js";
import { createProjectIntelligenceGraph, type ProjectGraphEdge, type ProjectGraphNode } from "./project-intelligence-graph.js";

export type CompiledRequirement = { id: string; statement: string; capabilities: string[]; platforms: ProjectConstitution["platforms"]; priority: "MUST" | "SHOULD" | "COULD"; acceptanceCriteria: string[]; dependencies: string[]; ambiguities: string[] };
export type ProductBuildPlan = { projectId: string; requirements: CompiledRequirement[]; nodes: ProjectGraphNode[]; edges: ProjectGraphEdge[]; missingDecisions: string[] };

const platformTerms: Array<[RegExp, ProjectConstitution["platforms"][number]]> = [[/android/i, "ANDROID"], [/ios|iphone|ipad/i, "IOS"], [/web|website|portal|browser/i, "WEB"], [/api|backend|server/i, "API"], [/image|logo|banner|graphic/i, "IMAGE"], [/video|reel|animation/i, "VIDEO"]];

export function compileRequirements(projectId: string, rawRequirements: string[]): ProductBuildPlan {
  const requirements: CompiledRequirement[] = rawRequirements.filter(Boolean).map((statement, index) => {
    const platforms = [...new Set(platformTerms.filter(([term]) => term.test(statement)).map(([, platform]) => platform))];
    const priority = /^must|required|critical/i.test(statement.trim()) ? "MUST" : /^should/i.test(statement.trim()) ? "SHOULD" : "COULD";
    const ambiguities: string[] = [];
    if (!platforms.length) ambiguities.push("TARGET_PLATFORM_NOT_EXPLICIT");
    if (!/[.!?]/.test(statement.trim())) ambiguities.push("ACCEPTANCE_CRITERIA_NOT_EXPLICIT");
    return { id: `req-${index + 1}`, statement: statement.trim(), capabilities: statement.split(/[,;]|\band\b/i).map(item => item.trim()).filter(Boolean), platforms: platforms.length ? platforms : ["OTHER"], priority, acceptanceCriteria: [], dependencies: [], ambiguities };
  });
  const nodes: ProjectGraphNode[] = requirements.map(req => ({ id: req.id, type: "REQUIREMENT", label: req.statement, metadata: { priority: req.priority, platforms: req.platforms, ambiguities: req.ambiguities } }));
  const edges: ProjectGraphEdge[] = [];
  for (const req of requirements) for (const capability of req.capabilities) { const id = `${req.id}:cap:${capability.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`; nodes.push({ id, type: "MODULE", label: capability }); edges.push({ from: id, to: req.id, type: "IMPLEMENTS" }); }
  const missingDecisions = requirements.filter(req => req.ambiguities.length).map(req => `${req.id}: ${req.ambiguities.join(", ")}`);
  return { projectId, requirements, ...createProjectIntelligenceGraph(projectId, nodes, edges), missingDecisions };
}
