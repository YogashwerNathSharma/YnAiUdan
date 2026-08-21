import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry } from "./tools.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
export type AutonomyMode = "CHAT_ONLY" | "SUGGEST" | "CONFIRM_TOOLS" | "SAFE_AUTO" | "AUTONOMOUS" | "FULLY_CONTROLLED";
export const autonomySchema = z.enum(["CHAT_ONLY", "SUGGEST", "CONFIRM_TOOLS", "SAFE_AUTO", "AUTONOMOUS", "FULLY_CONTROLLED"]);

type PersistedAutonomyMode = "CHAT_ONLY" | "SUGGEST_ACTIONS" | "ASK_BEFORE_TOOLS" | "AUTO_SAFE" | "AUTONOMOUS" | "FULLY_CONTROLLED";
export function normalizeAutonomyMode(mode: string): AutonomyMode {
  const mapping: Record<PersistedAutonomyMode, AutonomyMode> = {
    CHAT_ONLY: "CHAT_ONLY",
    SUGGEST_ACTIONS: "SUGGEST",
    ASK_BEFORE_TOOLS: "CONFIRM_TOOLS",
    AUTO_SAFE: "SAFE_AUTO",
    AUTONOMOUS: "AUTONOMOUS",
    FULLY_CONTROLLED: "FULLY_CONTROLLED"
  };
  return mapping[mode as PersistedAutonomyMode] ?? "CONFIRM_TOOLS";
}

const rolePermissions: Record<string, Set<string>> = {
  OWNER: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "GITHUB_PUSH", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE", "DEPLOY", "PRODUCTION_ACCESS"]),
  ADMIN: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE"]),
  DEVELOPER: new Set(["FILE_READ", "FILE_WRITE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE"]),
  USER: new Set(["FILE_READ", "GITHUB_READ", "GOOGLE_READ"]),
  AGENT: new Set(["FILE_READ", "GITHUB_READ"])
};

export function hasPermission(role: string, permission: string): boolean { return rolePermissions[role]?.has(permission) ?? false; }
export function canRunTool(role: string, toolName: string, mode: AutonomyMode): boolean {
  const tool = toolRegistry.get(toolName);
  if (!tool || mode === "CHAT_ONLY" || mode === "SUGGEST") return false;
  if (tool.risk === "LOW") return true;
  return tool.permissions.every(permission => hasPermission(role, permission));
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/permissions", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    return { role: auth.role, permissions: [...(rolePermissions[auth.role] ?? [])], autonomyModes: autonomySchema.options, tools: toolRegistry.list() };
  });
}
