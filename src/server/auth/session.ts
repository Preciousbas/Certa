import { randomBytes } from "node:crypto";
import { EncryptJWT } from "jose";
import { cookieSecure, readCookie } from "./http.js";
import { sessionKey } from "./sessionKey.js";
import { openSession, type PlatformRole, type SessionClaims } from "./sessionOpen.js";

export { readCookie, openSession };
export type { PlatformRole, SessionClaims };

const ABS_SECONDS = 7 * 24 * 60 * 60;

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (httpOnly) parts.push("HttpOnly");
  if (cookieSecure()) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookies(): string[] {
  return [cookie("certa_session", "", 0, true), cookie("certa_csrf", "", 0, false)];
}

export async function sealSession(input: {
  userId: string;
  telegramId: string;
  platformRole?: PlatformRole;
  now?: number;
  sid?: string;
  abs?: number;
  csrf?: string;
}): Promise<{ token: string; csrf: string; cookies: string[] }> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const abs = input.abs ?? now;
  const csrf = input.csrf ?? randomBytes(32).toString("hex");
  const sid = input.sid ?? randomBytes(16).toString("hex");
  const pra: PlatformRole = input.platformRole === "platform_admin" ? "platform_admin" : "user";
  const exp = abs + ABS_SECONDS;
  const token = await new EncryptJWT({ tid: input.telegramId, csrf, sid, abs, seen: now, pra })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(input.userId)
    .setIssuedAt(abs)
    .setExpirationTime(exp)
    .encrypt(await sessionKey());
  const maxAge = Math.max(0, exp - now);
  return {
    token,
    csrf,
    cookies: [cookie("certa_session", token, maxAge, true), cookie("certa_csrf", csrf, maxAge, false)],
  };
}

