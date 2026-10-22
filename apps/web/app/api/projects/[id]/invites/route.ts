import { getDatabase } from "@certa/db";
import { z } from "zod";
import { attachCookies } from "../../../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../../../src/server/auth/errors";
import { requireMember, runAsUser } from "../../../../../../../src/server/auth/rbac";
import { EXTRA_ROLES, inviteFixedRole, revokeProjectInvite } from "../../../../../../../src/server/projects/selfServe";
import { apiError } from "../../../../../lib/schemas";
import { requireUser } from "../../../../../lib/with-auth";

export const runtime = "nodejs";

const inviteInput = z
  .object({
    role: z.enum(EXTRA_ROLES).optional(),
    revokeCode: z.string().trim().min(8).max(16).optional(),
  })
  .strict();

function botName(): string {
  return process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "CertaApp_bot";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const parsed = inviteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return attachCookies(apiError(400, "Choose a consultant or subcontractor."), auth.setCookies);
  const db = await getDatabase();
  try {
    const result = await runAsUser({ db, userId: auth.user.id }, async () => {
      await requireMember(id);
      if (parsed.data.revokeCode) return revokeProjectInvite(db, { userId: auth.user.id, projectId: id, code: parsed.data.revokeCode });
      if (!parsed.data.role) return null;
      return inviteFixedRole(db, { userId: auth.user.id, projectId: id, role: parsed.data.role, botUsername: botName() });
    });
    if (!result) return attachCookies(apiError(400, "Choose a consultant or subcontractor."), auth.setCookies);
    if ("message" in result && result.ok === false) return attachCookies(apiError(409, result.message), auth.setCookies);
    return attachCookies(Response.json(result), auth.setCookies);
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
}
