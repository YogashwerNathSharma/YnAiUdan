export type DebugDiagnosis = {
  retryable: boolean;
  category: "TEST_FAILURE" | "TYPE_ERROR" | "BUILD_FAILURE" | "DEPENDENCY_ERROR" | "UNKNOWN";
  confidence: number;
  explanation: string;
};

export function diagnoseFailure(input: string): DebugDiagnosis {
  const text = input.toLowerCase();
  if (/cannot find module|module not found|no matching version|pnpm.*(install|lockfile)|npm.*(install|lockfile)/.test(text)) {
    return { retryable: false, category: "DEPENDENCY_ERROR", confidence: 0.9, explanation: "Dependency installation or resolution failed; review dependency state before automatic repair." };
  }
  if (/type error|ts\d{4}|is not assignable|property .* does not exist/.test(text)) {
    return { retryable: true, category: "TYPE_ERROR", confidence: 0.85, explanation: "The CI output indicates a TypeScript type error that may be repaired in source code." };
  }
  if (/test failed|assertion|failed.*test|tests?\s+failed/.test(text)) {
    return { retryable: true, category: "TEST_FAILURE", confidence: 0.8, explanation: "The CI output indicates a test failure that may be repaired in source code." };
  }
  if (/build failed|build.*error|compilation failed|compile failed/.test(text)) {
    return { retryable: true, category: "BUILD_FAILURE", confidence: 0.75, explanation: "The CI output indicates a build or compilation failure that may be repaired in source code." };
  }
  return { retryable: false, category: "UNKNOWN", confidence: 0.2, explanation: "The failure could not be classified safely; automatic repair is disabled." };
}
