import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal, dependency-free .env loader.
 *
 * The project had NO env loading at all — so WORKSPACE_ROOT, GROQ_API_KEY,
 * OPENAI_API_KEY etc. were never read, which is why the Computer Access
 * panel showed "No files yet" and the coding agent had no provider.
 *
 * This runs as the very first import in server.ts. It searches upward from
 * the API package for a `.env` file (so both apps/api/.env and the monorepo
 * root .env work) and loads any keys that are not already set in the real
 * process environment (real env vars always win).
 */
function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function findEnvFiles(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const found: string[] = [];
  let dir = here;
  // Walk up a few levels: src -> api -> apps -> repo root
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) found.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Closest .env (apps/api/.env) should win over the root one, so load the
  // farthest first and the closest last.
  return found.reverse();
}

export function loadEnv(): void {
  for (const file of findEnvFiles()) {
    try {
      const parsed = parseEnv(readFileSync(file, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
      }
    } catch {
      /* ignore unreadable .env */
    }
  }
}

loadEnv();
