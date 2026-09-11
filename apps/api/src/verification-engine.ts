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
  failOnStderr?: boolean;
}): VerificationReport {
  const checks: VerificationCheck[] = [];
  const expectedExitCode = input.expectedExitCode ?? 0;
  const exitPassed = input.exitCode === expectedExitCode;
  checks.push({ name: "EXIT_CODE", passed: exitPassed, evidence: `expected=${expectedExitCode}, actual=${input.exitCode}` });

  const hasStderr = Boolean(input.stderr?.trim());
  if (input.failOnStderr === true) {
    checks.push({ name: "STDERR", passed: !hasStderr, evidence: hasStderr ? input.stderr!.slice(0, 4000) : "No stderr output" });
  } else if (hasStderr) {
    checks.push({ name: "STDERR", passed: true, evidence: `Non-fatal stderr: ${input.stderr!.slice(0, 4000)}` });
  }

  if (input.requiredOutput !== undefined) {
    const output = `${input.stdout ?? ""}\n${input.stderr ?? ""}`;
    const outputPassed = output.includes(input.requiredOutput);
    checks.push({ name: "REQUIRED_OUTPUT", passed: outputPassed, evidence: outputPassed ? `Found: ${input.requiredOutput}` : `Missing: ${input.requiredOutput}` });
  }

  const passed = checks.filter(check => check.passed).length;
  const score = checks.length ? Math.round((passed / checks.length) * 100) : 0;
  const verified = checks.length > 0 && checks.every(check => check.passed);
  return {
    verified,
    score,
    checks,
    summary: verified ? "Execution passed all verification checks." : `${checks.length - passed} verification check(s) failed.`,
  };
}
