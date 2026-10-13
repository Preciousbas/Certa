import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramWebUser = { id: number; first_name?: string; username?: string };

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

export function verifyInitData(initData: string, botToken: string, nowSec = Math.floor(Date.now() / 1000)): TelegramWebUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(hash);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || nowSec - authDate > MAX_AGE_SECONDS || authDate > nowSec + 60) return null;
  const userRaw = params.get("user");
  if (!userRaw) return null;
  const user = JSON.parse(userRaw) as TelegramWebUser;
  if (!user.id) return null;
  return user;
}
