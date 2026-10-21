import { getDatabase, redeemJoinCode } from "@certa/db";
import { codeFromInvite } from "@certa/shared";
import { z } from "zod";
import { attachCookies } from "../../../../../../src/server/auth/authenticate";
import { apiError } from "../../../../lib/schemas";
import { requireUser } from "../../../../lib/with-auth";
import { sideLabel } from "../../../../../../src/server/projects/selfServe";

export const runtime = "nodejs";

const joinInput = z.object({ code: z.string().trim().min(8).max(200) }).strict();

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const parsed = joinInput.safeParse(await request.json().catch(() => null));
  const code = parsed.success ? codeFromInvite(parsed.data.code) : null;
  if (!code) return attachCookies(apiError(400, "Paste the invite link."), auth.setCookies);
  const db = await getDatabase();
  const result = await redeemJoinCode(db, {
    telegramId: auth.user.telegramId,
    name: auth.user.name,
    code,
  });
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That code has expired. Ask for a new one."
        : result.reason === "rate_limited"
          ? "Too many tries. Wait a few minutes."
          : result.reason === "revoked"
            ? "That invite was revoked."
            : result.reason === "taken"
              ? "That side of the contract is already taken."
              : "That code is not valid. Check it with the person who sent it.";
    return attachCookies(apiError(400, message), auth.setCookies);
  }
  return attachCookies(
    Response.json({
      projectId: result.projectId,
      role: result.role,
      message: `You've joined ${result.projectName} as the ${sideLabel(result.role)}.`,
    }),
    auth.setCookies,
  );
}
