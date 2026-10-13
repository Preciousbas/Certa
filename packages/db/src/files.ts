import { hmacHex, safeEqual } from "./crypto.js";

const MAX_TTL_SECONDS = 600;

export type SignedFile = { key: string; userId: string; expiresAt: number };

export function signDownload(opts: { key: string; userId: string; ttlSeconds: number; secret: string; now?: number }): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(opts.ttlSeconds, 1), MAX_TTL_SECONDS);
  const expiresAt = now + ttl;
  const payload = `${opts.key}.${opts.userId}.${expiresAt}`;
  const sig = hmacHex(opts.secret, payload);
  const params = new URLSearchParams({ key: opts.key, user: opts.userId, exp: String(expiresAt), sig });
  return `/api/files?${params.toString()}`;
}

export function verifyDownload(search: string, secret: string, now = Math.floor(Date.now() / 1000)): SignedFile | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const key = params.get("key");
  const userId = params.get("user");
  const exp = params.get("exp");
  const sig = params.get("sig");
  if (!key || !userId || !exp || !sig) return null;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt > now + MAX_TTL_SECONDS || expiresAt < now) return null;
  const expected = hmacHex(secret, `${key}.${userId}.${expiresAt}`);
  if (!safeEqual(expected, sig)) return null;
  return { key, userId, expiresAt };
}
