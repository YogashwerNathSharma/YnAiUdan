export type VerificationCheck = {
  name: string;
  passed: boolean;
  evidence?: string;
  error?: string;
};

export type VerificationReport = {
  verified: boolean;
  score: number;
  checks: VerificationCheck[];
  summary: string;
};

export function verifyExecution(input: {
  expectedExitCode?: number;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  requiredOutput?: string;
}): VerificationReport {
  const checks: VerificationCheck[] = [];
  const expectedExitCode = input.expectedExitCode ?? 0;
  const exitPassed = input.exitCode === expectedExitCode;
  checks.push({ name: "EXIT_CODE", passed: exitPassed, evidence: `expected=${expectedExitCode}, actual=${input.exitCode}` });

  const hasErrorOutput = Boolean(input.stderr?.trim());
  checks.push({ name: "STDERR", passed: !hasErrorOutput, evidence: hasErrorOutput ? input.stderr!.slice(0, 4000) : "No stderr output" });

  if (input.requiredOutput !== undefined) {
    const output = `${input.stdout ?? ""}\n${input.stderr ?? ""}`;
    const outputPassed = output.includes(input.requiredOutput);
    checks.push({ name: "REQUIRED_OUTPUT", passed: outputPassed, evidence: outputPassed ? `Found: ${input.requiredOutput}` : `Missing: ${input.requiredOutput}` });
  }

  const passed = checks.filter(check => check.passed).length;
  const score = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  return {
    verified: checks.length > 0 && checks.every(check => check.passed),
    score,
    checks,
    summary: checks.every(check => check.passed) ? "Execution passed all verification checks." : `${checks.length - passed} verification check(s) failed.`,
  };
}
