import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toolRegistry } from "./tools.js";

const commandInput = z.object({
  command: z.string().trim().min(1).max(2000),
  tenantId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  timeoutMs: z.number().int().min(1000).max(120_000).default(120_000),
});

const allowedCommands = new Set(["node", "npm", "pnpm", "npx", "git", "tsc", "python", "python3", "pytest", "go", "cargo", "rustc", "javac", "java", "dotnet", "swift", "ruby", "php", "composer", "gradle", "mvn"]);
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
  return path.resolve(workspaceBase, tenantId);
}

function parseCommand(command: string): { executable: string; args: string[] } {
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
    description: "Execute an allowlisted development command inside the tenant-isolated YnAiUdan workspace with bounded output and timeout.",
    inputSchema: commandInput,
    risk: "HIGH",
    permissions: ["TERMINAL_EXECUTE"],
    timeoutMs: 120_000,
    execute: async ({ command, tenantId, timeoutMs }) => {
      const { executable, args } = parseCommand(command);
      if (args.some(arg => !isSafeArgument(arg))) throw new Error("Command argument is outside the workspace-safe policy");
      const cwd = tenantRoot(tenantId);
      await fs.mkdir(cwd, { recursive: true });
      return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn(executable, args, {
          cwd,
          shell: false,
          windowsHide: true,
          env: { PATH: process.env.PATH, NODE_ENV: "development" },
        });
        let stdout = "";
        let stderr = "";
        const finish = (value: unknown) => { if (!settled) { settled = true; resolve(value); } };
        const timer = setTimeout(() => { child.kill(); finish({ exitCode: 124, stdout: stdout.slice(0, 200_000), stderr: `${stderr.slice(0, 190_000)}\nExecution timed out.`, tenantId, cwd, timedOut: true }); }, timeoutMs);
        child.stdout.on("data", data => { stdout += data.toString(); if (stdout.length > 200_000) child.kill(); });
        child.stderr.on("data", data => { stderr += data.toString(); if (stderr.length > 200_000) child.kill(); });
        child.on("error", error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
        child.on("close", code => { clearTimeout(timer); finish({ exitCode: code ?? 1, stdout: stdout.slice(0, 200_000), stderr: stderr.slice(0, 200_000), tenantId, cwd, timedOut: false }); });
      });
    },
  });
}
