import { randomUUID } from "node:crypto";

/**
 * In-memory auth store used ONLY when DATABASE_URL is empty (DB-free dev mode).
 *
 * This lets you log in / register and use the app (Computer Access panel,
 * coding agent, etc.) without a MongoDB connection. Data lives in memory and
 * is lost on restart. As soon as DATABASE_URL is set, the real Prisma-backed
 * auth is used instead and this store is ignored.
 */
export function isDbDisabled(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  // No URL at all -> DB-free dev mode.
  if (!url) return true;
  // Explicit opt-out.
  if (process.env.DB_MODE === "memory") return true;
  // A MongoDB connection string without credentials (no "user:pass@" before
  // the host) cannot authenticate against Atlas and would crash the backend.
  // Treat such an incomplete URL as DB-free so the app still runs. As soon as
  // a proper URL containing credentials ("@") is provided, real DB mode is
  // used automatically.
  const afterScheme = url.replace(/^mongodb(\+srv)?:\/\//i, "");
  const hasCredentials = afterScheme.includes("@");
  if (!hasCredentials) return true;
  return false;
}

export type DevUser = { id: string; tenantId: string; email: string; displayName: string; role: string; passwordHash: string };

const usersByEmail = new Map<string, DevUser>();
const usersById = new Map<string, DevUser>();

export const devAuthStore = {
  findByEmail(email: string): DevUser | undefined {
    return usersByEmail.get(email.toLowerCase());
  },
  findById(id: string): DevUser | undefined {
    return usersById.get(id);
  },
  create(params: { email: string; displayName: string; passwordHash: string; role?: string; tenantId?: string }): DevUser {
    const user: DevUser = {
      id: randomUUID().replace(/-/g, "").slice(0, 24),
      tenantId: params.tenantId ?? randomUUID().replace(/-/g, "").slice(0, 24),
      email: params.email.toLowerCase(),
      displayName: params.displayName,
      role: params.role ?? "OWNER",
      passwordHash: params.passwordHash
    };
    usersByEmail.set(user.email, user);
    usersById.set(user.id, user);
    return user;
  }
};
