import path from "node:path";
import { existsSync, statSync } from "node:fs";

/**
 * Central workspace-root resolution.
 *
 * The Computer Access panel can send an explicit absolute `root` folder per
 * request (typed by the user) so the AI can read/edit any project folder on
 * the machine — "like you do" — without depending on env vars or restarts.
 *
 * If no valid root is provided, we fall back to WORKSPACE_ROOT, then to a
 * local sandbox folder.
 */
export const defaultRoot = path.resolve(process.env.WORKSPACE_ROOT ?? path.join(process.cwd(), ".ynaiudan-workspaces"));

export function resolveRoot(provided?: string): string {
  const candidate = provided?.trim();
  if (candidate) {
    const abs = path.resolve(candidate);
    try {
      if (existsSync(abs) && statSync(abs).isDirectory()) return abs;
    } catch {
      /* fall through to default */
    }
  }
  return defaultRoot;
}

/**
 * Safely join a relative path under a resolved root. Rejects absolute paths
 * and `..` traversal so a request cannot escape the chosen folder.
 */
export function safeJoin(root: string, relativePath: string): string {
  if (!relativePath) return root;
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) throw new Error("Invalid path");
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Path escapes workspace root");
  return resolved;
}
