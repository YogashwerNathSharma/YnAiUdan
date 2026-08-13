import { taskQueue } from "./task-queue.js";

const intervalMs = Math.max(5_000, Number(process.env.TASK_QUEUE_RECOVERY_INTERVAL_MS ?? 60_000));
const staleMs = Math.max(30_000, Number(process.env.TASK_QUEUE_STALE_MS ?? 300_000));
let timer: NodeJS.Timeout | undefined;

export function startQueueRecovery(): void {
  if (timer) return;
  const recover = async () => {
    try { await taskQueue.recoverStale?.(staleMs); } catch (error) { console.error("Task queue recovery failed", error); }
  };
  void recover();
  timer = setInterval(() => void recover(), intervalMs);
}

export function stopQueueRecovery(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
