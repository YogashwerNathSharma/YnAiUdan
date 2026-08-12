import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toolRegistry } from "./tools.js";

const commandInput = z.object({ command: z.string().trim().min(1).max(2000) });
const allowedCommands = new Set(["node", "npm", "pnpm", "npx", "git", "tsc"]);

function parseCommand(command: string): { executable: string; args: string[] } {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, "")) ?? [];
  if (!parts.length || !allowedCommands.has(path.basename(parts[0]))) throw new Error("Command is not allowlisted");
  return { executable: parts[0], args: parts.slice(1) };
}

export function registerTerminalTool(): void {
  if (toolRegistry.get("terminal.execute")) return;
  toolRegistry.register({
    name: "terminal.execute",
    description: "Execute an allowlisted development command inside the isolated YnAiUdan workspace.",
    inputSchema: commandInput,
    risk: "HIGH",
    permissions: ["TERMINAL_EXECUTE"],
    timeoutMs: 120_000,
    execute: async ({ command }) => {
      const { executable, args } = parseCommand(command);
      const cwd = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));
      await fs.mkdir(cwd, { recursive: true });
      return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, NODE_ENV: "development" } });
        let stdout = ""; let stderr = "";
        child.stdout.on("data", data => { stdout += data.toString(); if (stdout.length > 200_000) child.kill(); });
        child.stderr.on("data", data => { stderr += data.toString(); if (stderr.length > 200_000) child.kill(); });
        child.on("error", reject);
        child.on("close", code => resolve({ exitCode: code ?? 1, stdout: stdout.slice(0, 200_000), stderr: stderr.slice(0, 200_000) }));
      });
    }
  });
}
