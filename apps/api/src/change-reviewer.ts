export type ChangeRecord = { path: string; status: "added" | "modified" | "deleted"; additions: number; deletions: number };
export type ChangeReview = { approved: boolean; score: number; issues: string[]; summary: string };

const SENSITIVE = [/\.env/i, /secret/i, /credential/i, /token/i, /password/i, /private[-_]?key/i];
const GENERATED = [/node_modules\//, /(^|\/)dist\//, /(^|\/)build\//, /\.next\//];

export function reviewChanges(changes: ChangeRecord[], requestedPaths: string[] = []): ChangeReview {
  const issues: string[] = [];
  let score = 100;
  for (const change of changes) {
    if (SENSITIVE.some(pattern => pattern.test(change.path))) { issues.push(`Sensitive path changed: ${change.path}`); score -= 35; }
    if (GENERATED.some(pattern => pattern.test(change.path))) { issues.push(`Generated/dependency path changed: ${change.path}`); score -= 15; }
    if (change.additions + change.deletions > 1000) { issues.push(`Large change requires manual review: ${change.path}`); score -= 15; }
    if (requestedPaths.length && !requestedPaths.some(path => change.path === path || change.path.startsWith(`${path.replace(/\/$/, "")}/`))) { issues.push(`Unexpected path changed: ${change.path}`); score -= 20; }
  }
  score = Math.max(0, score);
  return { approved: issues.length === 0, score, issues, summary: issues.length ? "Change requires review before it can be considered safe." : "Change scope passed the safety review." };
}
