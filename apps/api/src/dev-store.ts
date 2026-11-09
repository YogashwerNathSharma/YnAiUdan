import { randomUUID } from "node:crypto";

/**
 * Tiny in-memory user/tenant store for DB-free dev mode.
 *
 * Used ONLY when DATABASE_URL is empty, so the app (login / register /
 * Computer Access panel) works without a MongoDB instance. Data lives in
 * memory and is lost on restart — this is a development convenience, not a
 * production store. As soon as DATABASE_URL is set, the real Prisma-backed
 * auth path is used instead.
 */
export type DevUser = { id: string; tenantId: string; email: string; displayName: string; role: string; passwordHash: string };

export function isDbless(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

class DevUserStore {
  private readonly byEmail = new Map<string, DevUser>();
  private readonly byId = new Map<string, DevUser>();

  findByEmail(email: string): DevUser | undefined { return this.byEmail.get(email.toLowerCase()); }
  findById(id: string): DevUser | undefined { return this.byId.get(id); }

  create(user: Omit<DevUser, "id" | "tenantId"> & { tenantId?: string }): DevUser {
    const full: DevUser = { id: randomUUID(), tenantId: user.tenantId ?? randomUUID(), email: user.email.toLowerCase(), displayName: user.displayName, role: user.role, passwordHash: user.passwordHash };
    this.byEmail.set(full.email, full);
    this.byId.set(full.id, full);
    return full;
  }
}

export const devUsers = new DevUserStore();
