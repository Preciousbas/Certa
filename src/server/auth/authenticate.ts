import { getDatabase, type Database } from "@certa/db";
import { NOT_SIGNED_IN, SESSION_EXPIRED } from "./errors.js";
import { upsertTelegramIdentity, userById } from "./identity.js";
import { openSession, readCookie, sealSession } from "./session.js";
import { InitDataError, verifyInitData } from "./telegramInitData.js";
import type { UserRow } from "./rbac.js";

export type Authenticated = {
  user: UserRow;
  via: "tma" | "session";
  csrf: string;
  setCookies: string[];
};

function initDataFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^tma\s+(\S[\s\S]*)$/i.exec(header.trim());
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export async function authenticate(request: Request, db?: Database): Promise<Authenticated> {
  const database = db ?? (await getDatabase());
  const raw = initDataFrom(request);
  if (raw) {
    let profile;
    try {
      profile = verifyInitData(raw, process.env.TELEGRAM_BOT_TOKEN ?? "");
    } catch (error) {
      if (error instanceof InitDataError && error.reason === "expired") throw SESSION_EXPIRED;
      throw NOT_SIGNED_IN;
    }
    const user = await upsertTelegramIdentity(database, profile);
    const sealed = await sealSession({
      userId: user.id,
      telegramId: user.telegramId.toString(),
      platformRole: user.platformRole === "platform_admin" ? "platform_admin" : "user",
    });
    return { user, via: "tma", csrf: sealed.csrf, setCookies: sealed.cookies };
  }
  const token = readCookie(request.headers.get("cookie"), "certa_session");
  if (!token) throw NOT_SIGNED_IN;
  const claims = await openSession(token);
  const row = await userById(database, claims.sub);
  if (!row || row.telegramId.toString() !== claims.tid) throw NOT_SIGNED_IN;
  const sealed = await sealSession({
    userId: row.id,
    telegramId: row.telegramId.toString(),
    platformRole: row.platformRole === "platform_admin" ? "platform_admin" : "user",
    sid: claims.sid,
    abs: claims.abs,
    csrf: claims.csrf,
  });
  return { user: row, via: "session", csrf: sealed.csrf, setCookies: sealed.cookies };
}

export function attachCookies(response: Response, cookies: string[]): Response {
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
