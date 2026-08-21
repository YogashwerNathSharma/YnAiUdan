import { fullReview, type FullReview } from "./full-reviewer.js";
import type { SharedWorkspace } from "./workspace-context.js";

export function reviewWorkspace(workspace: SharedWorkspace, packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> }): FullReview {
  return fullReview({ files: workspace.files, packageJson });
}
