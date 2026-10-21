import { assertCsrf } from "../../../../../../src/server/auth/csrf";
import { AuthError } from "../../../../../../src/server/auth/errors";
import { originAllowed } from "../../../../../../src/server/auth/http";
import { clearSessionCookies, openSession, readCookie } from "../../../../../../src/server/auth/session";
import { apiError } from "../../../../lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!originAllowed(request.headers.get("origin"))) {
    return apiError(403, "You don't have permission to do this on this project.", "forbidden");
  }
  const token = readCookie(request.headers.get("cookie"), "certa_session");
  if (token) {
    try {
      const claims = await openSession(token);
      assertCsrf(request, claims.csrf);
    } catch (error) {
      if (error instanceof AuthError && error.code === "forbidden") return apiError(403, error.message, error.code);
    }
  }
  const response = Response.json({ ok: true });
  for (const cookie of clearSessionCookies()) response.headers.append("set-cookie", cookie);
  return response;
}
