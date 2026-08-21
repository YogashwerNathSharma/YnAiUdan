import { reviewSource, type CodeReview } from "./code-reviewer.js";
import { reviewArchitecture, type ArchitectureReview } from "./architecture-reviewer.js";
import { reviewDependencies, type DependencyReview } from "./dependency-reviewer.js";
import { reviewApiContracts, type ApiContractReview } from "./api-contract-reviewer.js";

export type FullReview = { approved: boolean; score: number; code: CodeReview; architecture: ArchitectureReview; dependencies: DependencyReview; apiContracts: ApiContractReview };

export function fullReview(input: {
  files: Array<{ path: string; content: string }>;
  packageJson?: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> };
}): FullReview {
  const code = reviewSource(input.files);
  const architecture = reviewArchitecture(input.files);
  const dependencies = reviewDependencies(input.packageJson ?? {});
  const apiContracts = reviewApiContracts(input.files);
  const scores = [code.score, architecture.score, dependencies.approved ? 100 : 50, apiContracts.approved ? 100 : 60];
  const score = Math.round(scores.reduce((a,b) => a + b, 0) / scores.length);
  return { approved: code.approved && architecture.approved && dependencies.approved && apiContracts.approved, score, code, architecture, dependencies, apiContracts };
}
