import { getDatabase, redeemJoinCode } from "@certa/db";
import { parseStartPayload } from "@certa/shared";
import { z } from "zod";
import { attachCookies } from "../../../../../../src/server/auth/authenticate";
import { apiError } from "../../../../lib/schemas";
import { requireUser } from "../../../../lib/with-auth";

export const runtime = "nodejs";

const joinInput = z.object({ code: z.string().trim().min(8).max(16) }).strict();

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const parsed = joinInput.safeParse(await request.json().catch(() => null));
  const payload = parsed.success ? parseStartPayload(parsed.data.code) : { kind: "plain" as const };
  if (!parsed.success || payload.kind !== "join") {
    return attachCookies(apiError(400, "Enter the 8-character invite code."), auth.setCookies);
  }
  const db = await getDatabase();
  const result = await redeemJoinCode(db, {
    telegramId: auth.user.telegramId,
    name: auth.user.name,
    code: payload.code,
  });
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That code has expired. Ask for a new one."
        : result.reason === "rate_limited"
          ? "Too many tries. Wait a few minutes."
          : "That code is not valid. Check it with the person who sent it.";
    return attachCookies(apiError(400, message), auth.setCookies);
  }
  return attachCookies(Response.json({ projectId: result.projectId }), auth.setCookies);
}
