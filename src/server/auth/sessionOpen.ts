import { jwtDecrypt, errors } from "jose";
import { AuthError, NOT_SIGNED_IN, SESSION_EXPIRED } from "./errors.js";
import { sessionKey } from "./sessionKey.js";

const ABS_SECONDS = 7 * 24 * 60 * 60;
const IDLE_SECONDS = 24 * 60 * 60;

export type PlatformRole = "user" | "platform_admin";

export type SessionClaims = {
  sub: string;
  tid: string;
  csrf: string;
  sid: string;
  abs: number;
  seen: number;
  pra: PlatformRole;
};

function claimNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function openSession(token: string, now = Math.floor(Date.now() / 1000)): Promise<SessionClaims> {
  try {
    const { payload } = await jwtDecrypt(token, await sessionKey());
    const abs = claimNumber(payload.abs);
    const seen = claimNumber(payload.seen);
    const tid = typeof payload.tid === "string" ? payload.tid : "";
    const csrf = typeof payload.csrf === "string" ? payload.csrf : "";
    const sid = typeof payload.sid === "string" ? payload.sid : "";
    const pra = payload.pra === "platform_admin" ? "platform_admin" : "user";
    if (!payload.sub || abs === null || seen === null || !tid || !csrf || !sid) throw NOT_SIGNED_IN;
    if (now - seen > IDLE_SECONDS || now - abs > ABS_SECONDS) throw SESSION_EXPIRED;
    return { sub: payload.sub, tid, csrf, sid, abs, seen, pra };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof errors.JWTExpired) throw SESSION_EXPIRED;
    throw NOT_SIGNED_IN;
  }
}
