import { getDatabase } from "@certa/db";
import { AuthError } from "../../../../../../src/server/auth/errors";
import { appOrigin, originAllowed } from "../../../../../../src/server/auth/http";
import { upsertTelegramIdentity } from "../../../../../../src/server/auth/identity";
import { clientIp, limitLogin, rateLimitedResponse } from "../../../../../../src/server/auth/rateLimit";
import { sealSession } from "../../../../../../src/server/auth/session";
import { LoginDataError, verifyLoginWidget } from "../../../../../../src/server/auth/telegramLogin";
import { apiError, loginWidgetInput } from "../../../../lib/schemas";

export const runtime = "nodejs";

function fieldsOf(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") fields[key] = String(item);
    else return null;
  }
  return fields;
}

async function accept(fields: Record<string, string>): Promise<Response> {
  const parsed = loginWidgetInput.safeParse(fields);
  if (!parsed.success) return apiError(401, "Sign in from Telegram.", "not_signed_in");
  try {
    const widget = verifyLoginWidget(parsed.data, process.env.TELEGRAM_BOT_TOKEN ?? "");
    const db = await getDatabase();
    const user = await upsertTelegramIdentity(db, {
      id: widget.id,
      ...(widget.first_name ? { first_name: widget.first_name } : {}),
      ...(widget.last_name ? { last_name: widget.last_name } : {}),
      ...(widget.username ? { username: widget.username } : {}),
      ...(widget.photo_url ? { photo_url: widget.photo_url } : {}),
    });
    const sealed = await sealSession({
      userId: user.id,
      telegramId: user.telegramId.toString(),
      platformRole: user.platformRole === "platform_admin" ? "platform_admin" : "user",
    });
    const response = Response.json({ ok: true, userId: user.id });
    for (const cookie of sealed.cookies) response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    if (error instanceof LoginDataError && error.reason === "expired") {
      return apiError(401, "Your session has expired. Close and reopen Certa in Telegram.", "session_expired");
    }
    if (error instanceof LoginDataError) return apiError(401, "Sign in from Telegram.", "not_signed_in");
    if (error instanceof AuthError) return apiError(error.status, error.message, error.code);
    const requestId = crypto.randomUUID();
    console.error(JSON.stringify({ requestId, message: error instanceof Error ? error.message : "failed" }));
    return apiError(500, "Something went wrong. Try again.");
  }
}

export async function POST(request: Request) {
  if (!(await limitLogin(clientIp(request)))) return rateLimitedResponse();
  if (!originAllowed(request.headers.get("origin"))) {
    return apiError(403, "You don't have permission to do this on this project.", "forbidden");
  }
  const body: unknown = await request.json().catch(() => null);
  const fields = fieldsOf(body);
  if (!fields) return apiError(401, "Sign in from Telegram.", "not_signed_in");
  return accept(fields);
}

export async function GET(request: Request) {
  if (!(await limitLogin(clientIp(request)))) return rateLimitedResponse();
  const fields = Object.fromEntries(new URL(request.url).searchParams.entries());
  const signed = await accept(fields);
  if (!signed.ok) return signed;
  const location = `${appOrigin() || new URL(request.url).origin}/app`;
  const redirect = new Response(null, { status: 302, headers: { location } });
  for (const cookie of signed.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  return redirect;
}
