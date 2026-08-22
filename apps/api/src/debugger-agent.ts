export type DebugDiagnosis = {
  retryable: boolean;
  category: "TEST_FAILURE" | "TYPE_ERROR" | "BUILD_FAILURE" | "DEPENDENCY_ERROR" | "UNKNOWN";
  confidence: number;
  explanation: string;
  summary: string;
};

function diagnosis(retryable: boolean, category: DebugDiagnosis["category"], confidence: number, summary: string): DebugDiagnosis {
  return { retryable, category, confidence, summary, explanation: summary };
}

export function diagnoseFailure(input: string): DebugDiagnosis {
  const text = input.toLowerCase();
  if (/cannot find module|module not found|no matching version|pnpm.*(install|lockfile)|npm.*(install|lockfile)/.test(text)) {
    return diagnosis(false, "DEPENDENCY_ERROR", 0.9, "Dependency installation or resolution failed; review dependency state before automatic repair.");
  }
  if (/type error|ts\d{4}|is not assignable|property .* does not exist/.test(text)) {
    return diagnosis(true, "TYPE_ERROR", 0.85, "The CI output indicates a TypeScript type error that may be repaired in source code.");
  }
  if (/test failed|assertion|failed.*test|tests?\s+failed/.test(text)) {
    return diagnosis(true, "TEST_FAILURE", 0.8, "The CI output indicates a test failure that may be repaired in source code.");
  }
  if (/build failed|build.*error|compilation failed|compile failed/.test(text)) {
    return diagnosis(true, "BUILD_FAILURE", 0.75, "The CI output indicates a build or compilation failure that may be repaired in source code.");
  }
  return diagnosis(false, "UNKNOWN", 0.2, "The failure could not be classified safely; automatic repair is disabled.");
}
