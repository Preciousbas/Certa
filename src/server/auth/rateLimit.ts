const buckets = new Map<string, number[]>();

const MESSAGE = "Too many requests. Please wait a minute and try again.";

export function resetLimits(): void {
  buckets.clear();
}

function limitOf(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return parsed > 0 ? parsed : fallback;
}

function memoryAllow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

async function allow(key: string, limit: number, windowMs: number, window: "1 m" | "1 h"): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (url.startsWith("https://") && token.length >= 8) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const { Redis } = await import("@upstash/redis");
      const limiter = new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `certa:${window}:${limit}`,
      });
      const result = await limiter.limit(key);
      return result.success;
    } catch (error) {
      const message = error instanceof Error ? error.message : "rate limit store unavailable";
      console.error(JSON.stringify({ message }));
    }
  }
  return memoryAllow(key, limit, windowMs);
}

export function limitMini(userId: string): Promise<boolean> {
  return allow(`mini:${userId}`, limitOf("RATE_LIMIT_MINI_PER_MIN", 60), 60_000, "1 m");
}

export function limitUpload(userId: string): Promise<boolean> {
  return allow(`upload:${userId}`, limitOf("RATE_LIMIT_UPLOAD_PER_HOUR", 20), 3_600_000, "1 h");
}

export function limitAi(projectId: string): Promise<boolean> {
  return allow(`ai:${projectId}`, limitOf("RATE_LIMIT_AI_PER_HOUR", 30), 3_600_000, "1 h");
}

export function limitLogin(ip: string): Promise<boolean> {
  return allow(`login:${ip}`, limitOf("RATE_LIMIT_LOGIN_PER_MIN", 10), 60_000, "1 m");
}

export function rateLimitedResponse(): Response {
  const requestId = crypto.randomUUID();
  return Response.json({ error: "rate_limited", message: MESSAGE, requestId }, { status: 429 });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}
