import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./auth.js";
import { toolRegistry, type ToolRisk } from "./tools.js";

type AuthPayload = { sub: string; tenantId: string; role: string };
// Autonomy modes come from TWO sources that must BOTH be assignable here:
//   1. the Prisma DB enum: CHAT_ONLY | SUGGEST_ACTIONS | ASK_BEFORE_TOOLS |
//      AUTO_SAFE | AUTONOMOUS | FULLY_CONTROLLED  (persisted on Task.autonomyMode)
//   2. the API zod enum below: CHAT_ONLY | SUGGEST | CONFIRM_TOOLS | SAFE_AUTO |
//      AUTONOMOUS | FULLY_CONTROLLED  (accepted from HTTP requests)
// The type is the union of both so values from either source type-check.
export type AutonomyMode = "CHAT_ONLY" | "SUGGEST" | "SUGGEST_ACTIONS" | "CONFIRM_TOOLS" | "ASK_BEFORE_TOOLS" | "SAFE_AUTO" | "AUTO_SAFE" | "AUTONOMOUS" | "FULLY_CONTROLLED";
export const autonomySchema = z.enum(["CHAT_ONLY", "SUGGEST", "CONFIRM_TOOLS", "SAFE_AUTO", "AUTONOMOUS", "FULLY_CONTROLLED"]);

const rolePermissions: Record<string, Set<string>> = {
  OWNER: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "GITHUB_PUSH", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE", "DEPLOY", "PRODUCTION_ACCESS"]),
  ADMIN: new Set(["FILE_READ", "FILE_WRITE", "FILE_DELETE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE", "GOOGLE_READ", "GOOGLE_WRITE"]),
  DEVELOPER: new Set(["FILE_READ", "FILE_WRITE", "TERMINAL_EXECUTE", "GITHUB_READ", "GITHUB_WRITE", "PR_CREATE"]),
  USER: new Set(["FILE_READ", "GITHUB_READ", "GOOGLE_READ"]),
  AGENT: new Set(["FILE_READ", "GITHUB_READ"])
};

export function hasPermission(role: string, permission: string): boolean { return rolePermissions[role]?.has(permission) ?? false; }

// Map any incoming autonomy-mode string (from the DB enum or the API zod enum)
// onto the canonical AutonomyMode union. Throws if unrecognised so callers can
// reject invalid input instead of silently running tools.
const AUTONOMY_MODES: AutonomyMode[] = ["CHAT_ONLY", "SUGGEST", "SUGGEST_ACTIONS", "CONFIRM_TOOLS", "ASK_BEFORE_TOOLS", "SAFE_AUTO", "AUTO_SAFE", "AUTONOMOUS", "FULLY_CONTROLLED"];
export function normalizeAutonomyMode(mode: string | null | undefined): AutonomyMode {
  const m = String(mode ?? "").trim().toUpperCase();
  if ((AUTONOMY_MODES as string[]).includes(m)) return m as AutonomyMode;
  throw new Error(`Invalid autonomy mode: ${mode}`);
}

// Whether a tool of the given risk needs explicit user approval before running
// in the given mode. Fully-autonomous / safe-auto modes never require approval;
// otherwise anything above LOW risk does.
export function requiresApproval(risk: ToolRisk, mode: string): boolean {
  const m = String(mode ?? "").toUpperCase();
  if (m === "AUTONOMOUS" || m === "FULLY_CONTROLLED" || m === "SAFE_AUTO" || m === "AUTO_SAFE") return false;
  return risk !== "LOW";
}

export function canRunTool(role: string, toolName: string, mode: string, approvalGranted = false): boolean {
  const tool = toolRegistry.get(toolName);
  // Modes that never execute tools (chat/suggest-only), from both naming sets.
  const noExec: AutonomyMode[] = ["CHAT_ONLY", "SUGGEST", "SUGGEST_ACTIONS"];
  if (!tool || noExec.includes(mode)) return false;
  if (tool.risk === "LOW") return true;
  return tool.permissions.every(permission => hasPermission(role, permission));
}

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/permissions", { preHandler: authenticate }, async request => {
    const auth = request.user as AuthPayload;
    return { role: auth.role, permissions: [...(rolePermissions[auth.role] ?? [])], autonomyModes: autonomySchema.options, tools: toolRegistry.list() };
  });
}
