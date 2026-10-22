import { AuthError } from "./errors.js";
import { originAllowed, readCookie, tokensMatch, usesMiniAppAuth } from "./http.js";

/** Cookie-authenticated mutations must send Origin and the double-submit header. Mini App `tma` calls are exempt. */
export function assertCsrf(request: Request, sessionCsrf: string): void {
  if (usesMiniAppAuth(request)) return;
  if (!originAllowed(request.headers.get("origin"))) {
    throw new AuthError(403, "forbidden", "You don't have permission to do this on this project.");
  }
  const header = request.headers.get("x-csrf-token") ?? "";
  const cookie = readCookie(request.headers.get("cookie"), "certa_csrf") ?? "";
  if (!tokensMatch(header, sessionCsrf) || !tokensMatch(header, cookie)) {
    throw new AuthError(403, "forbidden", "You don't have permission to do this on this project.");
  }
}
