export type DependencyFinding = { severity: "HIGH" | "MEDIUM" | "LOW"; rule: string; message: string; package?: string };
export type DependencyReview = { approved: boolean; findings: DependencyFinding[] };

const riskyNames = [/event-stream/i, /colors?\.js/i, /left-pad/i];
const suspiciousScripts = ["preinstall", "install", "postinstall"];

export function reviewDependencies(pkg: { dependencies?: Record<string,string>; devDependencies?: Record<string,string>; scripts?: Record<string,string> }): DependencyReview {
  const findings: DependencyFinding[] = [];
  for (const [name, version] of Object.entries({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
    if (riskyNames.some(pattern => pattern.test(name))) findings.push({ severity: "MEDIUM", rule: "RISKY_PACKAGE_NAME", message: `Dependency ${name} requires explicit review.`, package: name });
    if (/^(latest|\*|x|X)$/i.test(version)) findings.push({ severity: "LOW", rule: "UNPINNED_VERSION", message: `Dependency ${name} is not pinned to a concrete version.`, package: name });
  }
  for (const script of suspiciousScripts) if (pkg.scripts?.[script]) findings.push({ severity: "HIGH", rule: "INSTALL_SCRIPT", message: `Package defines a ${script} lifecycle script.` });
  return { approved: !findings.some(f => f.severity === "HIGH"), findings };
}
