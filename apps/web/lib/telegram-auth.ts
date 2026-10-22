import { verifyInitData, type TelegramWebUser } from "@certa/db";

export { signInitData, verifyInitData } from "@certa/db";
export type { TelegramWebUser } from "@certa/db";

/** `Authorization: tma <initData>` as sent by the Mini App. */
export function readInitData(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^tma (.+)$/i.exec(header.trim());
  const value = match?.[1]?.trim();
  return value ? value : null;
}

export function userFromRequest(request: Request, botToken: string, nowSec?: number): TelegramWebUser | null {
  const initData = readInitData(request);
  if (!initData || !botToken) return null;
  return verifyInitData(initData, botToken, nowSec);
}
