import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toolRegistry } from "./tools.js";
import { DEFAULT_SANDBOX_PROFILE, sandboxWorkspace, validateSandboxCommand } from "./sandbox-policy.js";
import { executeSandboxed } from "./sandbox-runtime.js";

const commandInput = z.object({
  command: z.string().trim().min(1).max(2000),
  tenantId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  timeoutMs: z.number().int().min(1000).max(DEFAULT_SANDBOX_PROFILE.maxWallTimeMs).default(DEFAULT_SANDBOX_PROFILE.maxWallTimeMs),
});

const allowedCommands = new Set(DEFAULT_SANDBOX_PROFILE.allowedExecutables);
const blockedFragments = [
  /(^|\s)(rm|rmdir|del|format)(\s|$)/i,
  /(^|\s)(shutdown|reboot)(\s|$)/i,
  /(^|\s)(sudo|su)(\s|$)/i,
  /(^|\s)(curl|wget)(\s|$)/i,
  /(^|\s)(nc|netcat|ncat)(\s|$)/i,
  /(^|\s)(chmod|chown)(\s|$)/i,
  /(^|\s)(kill|pkill|killall)(\s|$)/i,
];
const workspaceBase = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));

function tenantRoot(tenantId: string): string {
  return sandboxWorkspace(workspaceBase, tenantId);
}

function parseCommand(command: string): { executable: string; args: string[] } {
  validateSandboxCommand(command);
  if (blockedFragments.some(pattern => pattern.test(command))) throw new Error("Command contains a blocked operation");
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, "")) ?? [];
  if (!parts.length || !allowedCommands.has(path.basename(parts[0]))) throw new Error("Command is not allowlisted");
  return { executable: parts[0], args: parts.slice(1) };
}

function isSafeArgument(arg: string): boolean {
  return !arg.includes("..") && !path.isAbsolute(arg) && !/[;&|`$<>]/.test(arg);
}

export function registerTerminalTool(): void {
  if (toolRegistry.get("terminal.execute")) return;
  toolRegistry.register({
    name: "terminal.execute",
    description: "Execute an allowlisted development command through the universal sandbox runtime.",
    inputSchema: commandInput,
    risk: "HIGH",
    permissions: ["TERMINAL_EXECUTE"],
    timeoutMs: DEFAULT_SANDBOX_PROFILE.maxWallTimeMs,
    execute: async ({ command, tenantId, timeoutMs }) => {
      const { executable, args } = parseCommand(command);
      if (args.some(arg => !isSafeArgument(arg))) throw new Error("Command argument is outside the workspace-safe policy");
      const cwd = tenantRoot(tenantId);
      await fs.mkdir(cwd, { recursive: true });
      return executeSandboxed({ executable, args, tenantId, cwd, timeoutMs });
    },
  });
}
