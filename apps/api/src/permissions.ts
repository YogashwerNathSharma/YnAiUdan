import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry, type ToolRisk } from "./tools.js";

type AuthPayload = { sub: string; tenantId: string; role: string };

/** Canonical values match prisma/schema.prisma. Legacy aliases are accepted at API boundaries. */
export type AutonomyMode = "CHAT_ONLY" | "SUGGEST_ACTIONS" | "ASK_BEFORE_TOOLS" | "AUTO_SAFE" | "AUTONOMOUS" | "FULLY_CONTROLLED";
export const autonomySchema = z.enum(["CHAT_ONLY", "SUGGEST_ACTIONS", "ASK_BEFORE_TOOLS", "AUTO_SAFE", "AUTONOMOUS", "FULLY_CONTROLLED"]);
const legacyModeMap: Record<string, AutonomyMode> = { SUGGEST: "SUGGEST_ACTIONS", CONFIRM_TOOLS: "ASK_BEFORE_TOOLS", SAFE_AUTO: "AUTO_SAFE" };

export function normalizeAutonomyMode(mode: string): AutonomyMode {
  return legacyModeMap[mode] ?? autonomySchema.parse(mode);
}

const rolePermissions: Record<string, Set<string>> = {
  OWNER: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "GITHUB_PUSH", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE", "DEPLOY", "PRODUCTION_ACCESS"]),
  ADMIN: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE"]),
  DEVELOPER: new Set(["FILE_READ", "FILE_WRITE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE"]),
  USER: new Set(["FILE_READ", "GITHUB_READ", "GOOGLE_READ"]),
  AGENT: new Set(["FILE_READ", "GITHUB_READ"])
};

export function hasPermission(role: string, permission: string): boolean { return rolePermissions[role]?.has(permission) ?? false; }

export function canRunTool(role: string, toolName: string, mode: string, approvalGranted = false): boolean {
  const tool = toolRegistry.get(toolName);
  if (!tool) return false;
  const normalized = normalizeAutonomyMode(mode);
  if (normalized === "CHAT_ONLY" || normalized === "SUGGEST_ACTIONS") return false;
  if (!tool.permissions.every(permission => hasPermission(role, permission))) return false;
  if (approvalGranted) return true;
  if (normalized === "ASK_BEFORE_TOOLS") return tool.risk === "LOW";
  if (normalized === "AUTO_SAFE") return tool.risk === "LOW";
  return true;
}

export function requiresApproval(toolRisk: ToolRisk, mode: string): boolean {
  const normalized = normalizeAutonomyMode(mode);
  return (normalized === "ASK_BEFORE_TOOLS" || normalized === "AUTO_SAFE") && toolRisk !== "LOW";
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/permissions", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    return { role: auth.role, permissions: [...(rolePermissions[auth.role] ?? [])], autonomyModes: autonomySchema.options, tools: toolRegistry.list() };
  });
}
