import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
};

export class InitDataError extends Error {
  readonly reason: "invalid" | "expired";

  constructor(reason: "invalid" | "expired") {
    super(reason);
    this.name = "InitDataError";
    this.reason = reason;
  }
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(actual) || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function seconds(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString(params)).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

/** Telegram Mini App initData. `maxAgeSec` defaults to one hour. */
export function verifyInitData(raw: string, botToken: string, maxAgeSec = 3600): TelegramUser {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !botToken) throw new InitDataError("invalid");
  params.delete("hash");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString(params)).digest("hex");
  if (!sameHex(expected, hash)) throw new InitDataError("invalid");
  const nowSec = Math.floor(Date.now() / 1000);
  const authDate = seconds(params.get("auth_date"));
  if (authDate === null) throw new InitDataError("invalid");
  if (authDate > nowSec + 60 || nowSec - authDate > maxAgeSec) throw new InitDataError("expired");
  const userRaw = params.get("user");
  if (!userRaw) throw new InitDataError("invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    throw new InitDataError("invalid");
  }
  if (!parsed || typeof parsed !== "object" || !("id" in parsed)) throw new InitDataError("invalid");
  const id = parsed.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) throw new InitDataError("invalid");
  const text = (key: string): string | undefined => {
    if (!(key in parsed)) return undefined;
    const value = (parsed as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  };
  const user: TelegramUser = { id };
  const first = text("first_name");
  const last = text("last_name");
  const username = text("username");
  const language = text("language_code");
  const photo = text("photo_url");
  if (first) user.first_name = first;
  if (last) user.last_name = last;
  if (username) user.username = username;
  if (language) user.language_code = language;
  if (photo) user.photo_url = photo;
  return user;
}
