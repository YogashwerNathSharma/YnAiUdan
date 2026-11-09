import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toolRegistry } from "./tools.js";
import { resolveRoot } from "./workspace-root.js";

const commandInput = z.object({ command: z.string().trim().min(1).max(2000), root: z.string().max(1000).optional() });
const allowedCommands = new Set(["node", "npm", "pnpm", "npx", "git", "tsc"]);

function parseCommand(command: string): { executable: string; args: string[] } {
  validateSandboxCommand(command);
  if (blockedFragments.some(pattern => pattern.test(command))) throw new Error("Command contains a blocked operation");
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, "")) ?? [];
  if (!parts.length || !allowedCommands.has(path.basename(parts[0]))) throw new Error("Command is not allowlisted");
  const executable = parts[0];
  const args = parts.slice(1);
  // Block dependency installs: they are slow, hit the network, and time out.
  // All dependencies are already installed in this workspace, so an agent
  // never needs to run them. Reject instantly instead of waiting for a timeout.
  const base = path.basename(executable).toLowerCase();
  const sub = (args[0] ?? "").toLowerCase();
  if (["npm", "pnpm", "npx"].includes(base) && ["install", "i", "add", "ci", "update"].includes(sub)) {
    throw new Error("Dependency installs are disabled (deps are already installed). Use 'npx tsc --noEmit' to verify types.");
  }
  return { executable, args };
}

function isSafeArgument(arg: string): boolean {
  return !arg.includes("..") && !path.isAbsolute(arg) && !/[;&|`$<>]/.test(arg);
}

export function registerTerminalTool(): void {
  if (toolRegistry.get("terminal.execute")) return;
  toolRegistry.register({
    name: "terminal.execute",
    description: "Execute an allowlisted development command inside the chosen workspace folder.",
    inputSchema: commandInput,
    risk: "HIGH",
    permissions: ["TERMINAL_EXECUTE"],
    timeoutMs: Number(process.env.TERMINAL_TIMEOUT_MS ?? 45_000),
    execute: async ({ command, root }) => {
      const { executable, args } = parseCommand(command);
      const cwd = resolveRoot(root);
      await fs.mkdir(cwd, { recursive: true });
      return new Promise((resolve, reject) => {
        // On Windows, npm/pnpm/npx/tsc are .cmd/.ps1 shims (not .exe), so
        // spawn() with shell:false can't find them and fails with
        // "spawn npm ENOENT". Using the shell lets the OS resolve the shim
        // from PATH. The command is already validated against an allowlist
        // above, so this does not widen what can be run.
        const isWindows = process.platform === "win32";
        const child = isWindows
          ? spawn(`${executable} ${args.join(" ")}`, { cwd, shell: true, windowsHide: true, env: { ...process.env, NODE_ENV: "development" } })
          : spawn(executable, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, NODE_ENV: "development" } });
        let stdout = ""; let stderr = "";
        child.stdout.on("data", data => { stdout += data.toString(); if (stdout.length > 200_000) child.kill(); });
        child.stderr.on("data", data => { stderr += data.toString(); if (stderr.length > 200_000) child.kill(); });
        child.on("error", reject);
        child.on("close", code => resolve({ exitCode: code ?? 1, stdout: stdout.slice(0, 200_000), stderr: stderr.slice(0, 200_000) }));
      });
    }
  });
}
