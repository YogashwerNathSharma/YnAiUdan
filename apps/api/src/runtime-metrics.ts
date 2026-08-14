const startedAt = Date.now();
const counters = { aiRequests: 0, aiFailures: 0, aiFallbacks: 0 };

export function recordAIRequest(result: "success" | "failure" | "fallback"): void {
  counters.aiRequests += 1;
  if (result === "failure") counters.aiFailures += 1;
  if (result === "fallback") counters.aiFallbacks += 1;
}

export function runtimeMetrics() {
  return { uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), ...counters };
}
