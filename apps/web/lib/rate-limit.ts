const WINDOW_MS = 60_000;
const MAX_HITS = 30;

const buckets = new Map<string, number[]>();

export function resetRateLimit(): void {
  buckets.clear();
}

export function consumeRateLimit(key: string, now = Date.now()): { ok: boolean } {
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    buckets.set(key, recent);
    return { ok: false };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
}
