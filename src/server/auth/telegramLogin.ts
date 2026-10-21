import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type LoginWidgetUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
};

export class LoginDataError extends Error {
  readonly reason: "invalid" | "expired";

  constructor(reason: "invalid" | "expired") {
    super(reason);
    this.name = "LoginDataError";
    this.reason = reason;
  }
}

const DAY = 24 * 60 * 60;

function sameHex(expected: string, actual: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(actual) || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signLoginWidget(fields: Record<string, string>, botToken: string): Record<string, string> {
  const pairs = Object.entries(fields)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const check = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return { ...Object.fromEntries(pairs), hash };
}

/** Telegram Login Widget. `auth_date` must be within 24 hours and not more than 60 seconds ahead. */
export function verifyLoginWidget(
  fields: Record<string, string>,
  botToken: string,
  nowSec = Math.floor(Date.now() / 1000),
): LoginWidgetUser {
  const hash = fields.hash ?? "";
  if (!hash || !botToken) throw new LoginDataError("invalid");
  const signed = signLoginWidget(fields, botToken);
  if (!sameHex(signed.hash ?? "", hash)) throw new LoginDataError("invalid");
  const authRaw = fields.auth_date ?? "";
  if (!/^\d+$/.test(authRaw) || !/^\d+$/.test(fields.id ?? "")) throw new LoginDataError("invalid");
  const authDate = Number.parseInt(authRaw, 10);
  const id = Number.parseInt(fields.id ?? "", 10);
  if (!Number.isFinite(authDate) || !Number.isInteger(id) || id <= 0) throw new LoginDataError("invalid");
  if (authDate > nowSec + 60 || nowSec - authDate > DAY) throw new LoginDataError("expired");
  const user: LoginWidgetUser = { id, auth_date: authDate };
  if (fields.first_name) user.first_name = fields.first_name;
  if (fields.last_name) user.last_name = fields.last_name;
  if (fields.username) user.username = fields.username;
  if (fields.photo_url) user.photo_url = fields.photo_url;
  return user;
}
