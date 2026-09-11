import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SANDBOX_PROFILE } from "./sandbox-policy.js";

export type SandboxExecutionInput = {
  executable: string;
  args: string[];
  tenantId: string;
  cwd: string;
  timeoutMs: number;
};

export type SandboxExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  tenantId: string;
  cwd: string;
  timedOut: boolean;
  isolated: boolean;
  backend: "process" | "container";
  resourceLimit?: "TIMEOUT" | "OUTPUT";
};

const backend = process.env.EXECUTION_BACKEND === "container" ? "container" : "process";
const sandboxImage = process.env.SANDBOX_IMAGE ?? "ynaiudan/sandbox:latest";
const outputLimit = DEFAULT_SANDBOX_PROFILE.maxOutputBytes;

function collectProcess(child: ReturnType<typeof spawn>, input: SandboxExecutionInput, isolated: boolean, backendName: "process" | "container"): Promise<SandboxExecutionResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let outputExceeded = false;
    const finish = (value: SandboxExecutionResult) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ exitCode: 124, stdout: stdout.slice(0, outputLimit), stderr: `${stderr.slice(0, outputLimit - 20)}\nExecution timed out.`, tenantId: input.tenantId, cwd: input.cwd, timedOut: true, isolated, backend: backendName, resourceLimit: "TIMEOUT" });
    }, input.timeoutMs);
    child.stdout.on("data", data => {
      stdout += data.toString();
      if (stdout.length > outputLimit) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", data => {
      stderr += data.toString();
      if (stderr.length > outputLimit) {
        outputExceeded = true;
        child.kill("SIGKILL");
      }
    });
    child.on("error", error => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", code => {
      clearTimeout(timer);
      finish({ exitCode: outputExceeded ? 137 : (code ?? 1), stdout: stdout.slice(0, outputLimit), stderr: stderr.slice(0, outputLimit), tenantId: input.tenantId, cwd: input.cwd, timedOut: false, isolated, backend: backendName, resourceLimit: outputExceeded ? "OUTPUT" : undefined });
    });
  });
}

function containerArgs(input: SandboxExecutionInput): string[] {
  const workspace = path.resolve(input.cwd);
  const relativeWorkdir = "/workspace";
  return [
    "run", "--rm", "--init",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--pids-limit=128",
    "--memory=512m",
    "--cpus=1",
    "--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=64m",
    "--mount", `type=bind,src=${workspace},dst=${relativeWorkdir},readonly=false`,
    "--workdir", relativeWorkdir,
    "--user", "10001:10001",
    sandboxImage,
    input.executable,
    ...input.args,
  ];
}

export async function executeSandboxed(input: SandboxExecutionInput): Promise<SandboxExecutionResult> {
  await fs.mkdir(input.cwd, { recursive: true });
  if (backend === "container") {
    return collectProcess(spawn("docker", containerArgs(input), { shell: false, windowsHide: true, env: { PATH: process.env.PATH, NODE_ENV: "production" } }), input, true, "container");
  }
  return collectProcess(spawn(input.executable, input.args, { cwd: input.cwd, shell: false, windowsHide: true, env: { PATH: process.env.PATH, NODE_ENV: "development" } }), input, false, "process");
}

export function sandboxRuntimeInfo() {
  return {
    backend,
    isolated: backend === "container",
    image: backend === "container" ? sandboxImage : null,
    network: backend === "container" ? "none" : "host-process-inherited",
    memoryMb: backend === "container" ? 512 : null,
    cpus: backend === "container" ? 1 : null,
    pidsLimit: backend === "container" ? 128 : null,
  } as const;
}
