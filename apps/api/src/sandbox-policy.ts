import path from "node:path";

export type SandboxProfile = {
  isolationLevel: "workspace-process";
  networkAccess: "disabled-by-policy";
  maxWallTimeMs: number;
  maxOutputBytes: number;
  workspaceOnly: true;
  allowedExecutables: string[];
};

export const DEFAULT_SANDBOX_PROFILE: SandboxProfile = {
  isolationLevel: "workspace-process",
  networkAccess: "disabled-by-policy",
  maxWallTimeMs: 120_000,
  maxOutputBytes: 200_000,
  workspaceOnly: true,
  allowedExecutables: [
    "node", "npm", "pnpm", "npx", "git", "tsc", "python", "python3", "pytest",
    "go", "cargo", "rustc", "javac", "java", "dotnet", "swift", "ruby", "php", "composer", "gradle", "mvn",
  ],
};

export function sandboxWorkspace(root: string, tenantId: string): string {
  return path.resolve(root, tenantId);
}

export function validateSandboxCommand(command: string, profile = DEFAULT_SANDBOX_PROFILE): void {
  const executable = command.trim().split(/\s+/, 1)[0];
  if (!executable || !profile.allowedExecutables.includes(path.basename(executable))) {
    throw new Error("Sandbox policy rejected the executable");
  }
  if (/\b(curl|wget|nc|netcat|ncat)\b/i.test(command)) {
    throw new Error("Sandbox policy rejected network-capable command");
  }
  if (/[;&|`$<>]/.test(command) || /(^|\s)(rm|rmdir|del|format|shutdown|reboot|sudo|su|chmod|chown|kill|pkill|killall)(\s|$)/i.test(command)) {
    throw new Error("Sandbox policy rejected unsafe command syntax");
  }
}
