export type ProjectNodeType = "REQUIREMENT" | "MODULE" | "FILE" | "API" | "DATABASE" | "PLATFORM" | "DECISION" | "CHANGE" | "VERIFICATION";
export type ProjectEdgeType = "IMPLEMENTS" | "DEPENDS_ON" | "EXPOSES" | "STORES" | "TARGETS" | "MOTIVATED_BY" | "CHANGES" | "VERIFIED_BY" | "SUPERSEDES";

export type ProjectGraphNode = { id: string; type: ProjectNodeType; label: string; metadata?: Record<string, unknown> };
export type ProjectGraphEdge = { from: string; to: string; type: ProjectEdgeType; metadata?: Record<string, unknown> };

export type ProjectIntelligenceGraph = { version: 1; projectId: string; nodes: ProjectGraphNode[]; edges: ProjectGraphEdge[] };

export function createProjectIntelligenceGraph(projectId: string, nodes: ProjectGraphNode[], edges: ProjectGraphEdge[]): ProjectIntelligenceGraph {
  const nodeIds = new Set(nodes.map(node => node.id));
  const validEdges = edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  return { version: 1, projectId, nodes, edges: validEdges };
}

export function impactedNodeIds(graph: ProjectIntelligenceGraph, changedNodeId: string, maxDepth = 3): string[] {
  if (!graph.nodes.some(node => node.id === changedNodeId)) return [];
  const impacted = new Set<string>([changedNodeId]);
  let frontier = [changedNodeId];
  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const edge of graph.edges) {
        if (edge.from === nodeId && !impacted.has(edge.to)) { impacted.add(edge.to); next.push(edge.to); }
      }
    }
    frontier = next;
  }
  return [...impacted];
}
