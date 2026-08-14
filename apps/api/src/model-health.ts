type ProviderState = { failures: number; openedAt: number | null; successes: number; lastError?: string };

const states = new Map<string, ProviderState>();
const failureThreshold = Math.max(1, Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD ?? 3));
const cooldownMs = Math.max(5_000, Number(process.env.AI_CIRCUIT_COOLDOWN_MS ?? 30_000));

function state(provider: string): ProviderState {
  const current = states.get(provider) ?? { failures: 0, openedAt: null, successes: 0 };
  states.set(provider, current);
  return current;
}

export function providerCircuitOpen(provider: string): boolean {
  const current = state(provider);
  if (current.openedAt === null) return false;
  if (Date.now() - current.openedAt >= cooldownMs) {
    current.openedAt = null;
    current.failures = 0;
    return false;
  }
  return true;
}

export function recordProviderSuccess(provider: string): void {
  const current = state(provider);
  current.successes += 1;
  current.failures = 0;
  current.openedAt = null;
  current.lastError = undefined;
}

export function recordProviderFailure(provider: string, error: unknown): void {
  const current = state(provider);
  current.failures += 1;
  current.lastError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  if (current.failures >= failureThreshold) current.openedAt = Date.now();
}

export function providerHealthSnapshot() {
  return Object.fromEntries([...states.entries()].map(([provider, current]) => [provider, {
    status: providerCircuitOpen(provider) ? "open" : "closed",
    failures: current.failures,
    successes: current.successes,
    lastError: current.lastError
  }]));
}
