import { reviewSource, type CodeReview } from "./code-reviewer.js";
import { reviewArchitecture, type ArchitectureReview } from "./architecture-reviewer.js";
import { reviewDependencies, type DependencyReview } from "./dependency-reviewer.js";

export type FullReview = { approved: boolean; score: number; code: CodeReview; architecture: ArchitectureReview; dependencies: DependencyReview };

export function fullReview(input: {
  files: Array<{ path: string; content: string }>;
  packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> };
}): FullReview {
  const code = reviewSource(input.files);
  const architecture = reviewArchitecture(input.files);
  const dependencies = reviewDependencies(input.packageJson ?? {});
  const scores = [code.score, architecture.score, dependencies.approved ? 100 : 50];
  const score = Math.round(scores.reduce((a,b) => a + b, 0) / scores.length);
  return { approved: code.approved && architecture.approved && dependencies.approved, score, code, architecture, dependencies };
}
