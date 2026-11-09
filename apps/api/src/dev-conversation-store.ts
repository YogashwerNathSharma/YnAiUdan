import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Shared conversation store for DB-free dev mode.
 *
 * Kept in its OWN module so both the conversation routes and the chat-stream
 * endpoint read/write the SAME data — this is what gives the chat a memory
 * (previous messages) without a database.
 *
 * IMPORTANT: conversations are now persisted to a JSON file on disk, so the
 * chat history survives server/app restarts. The assistant never "forgets"
 * earlier chats — they are reloaded from disk on boot.
 */
export type DevMessage = { id: string; role: string; content: string; createdAt: string };
export type DevConversation = { id: string; userId: string; projectId: string | null; title: string; createdAt: string; updatedAt: string; messages: DevMessage[] };

// Where the persisted history lives. Override with DEV_STORE_FILE if needed.
const STORE_FILE = process.env.DEV_STORE_FILE ?? join(process.cwd(), ".dev-data", "conversations.json");

function loadFromDisk(): DevConversation[] {
  try {
    const raw = readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DevConversation[];
  } catch {
    // no file yet (first run) or unreadable — start empty
  }
  return [];
}

const conversations: DevConversation[] = loadFromDisk();

let saveTimer: NodeJS.Timeout | null = null;
function persist(): void {
  // Debounced write so rapid message appends don't thrash the disk.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(STORE_FILE), { recursive: true });
      writeFileSync(STORE_FILE, JSON.stringify(conversations), "utf-8");
    } catch {
      // best-effort; keep serving from memory even if the write fails
    }
  }, 150);
}

const newId = () => randomUUID().replace(/-/g, "").slice(0, 24);

export const devConversationStore = {
  all(): DevConversation[] { return conversations; },
  listForUser(userId: string): DevConversation[] {
    return conversations.filter(c => c.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  find(id: string, userId: string): DevConversation | undefined {
    return conversations.find(c => c.id === id && c.userId === userId);
  },
  create(userId: string, projectId: string | null, title: string): DevConversation {
    const now = new Date().toISOString();
    const c: DevConversation = { id: newId(), userId, projectId, title, createdAt: now, updatedAt: now, messages: [] };
    conversations.unshift(c);
    persist();
    return c;
  },
  addMessage(id: string, userId: string, role: string, content: string): DevMessage | undefined {
    const c = this.find(id, userId);
    if (!c) return undefined;
    const m: DevMessage = { id: newId(), role, content, createdAt: new Date().toISOString() };
    c.messages.push(m);
    c.updatedAt = m.createdAt;
    persist();
    return m;
  },
  remove(id: string, userId: string): boolean {
    const idx = conversations.findIndex(c => c.id === id && c.userId === userId);
    if (idx === -1) return false;
    conversations.splice(idx, 1);
    persist();
    return true;
  }
};
