import { getDatabase } from "@certa/db";
import { z } from "zod";
import { attachCookies } from "../../../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../../../src/server/auth/errors";
import { requireMember, runAsUser } from "../../../../../../../src/server/auth/rbac";
import { INVITE_ROLES, inviteToProject } from "../../../../../../../src/server/projects/selfServe";
import { apiError } from "../../../../../lib/schemas";
import { requireUser } from "../../../../../lib/with-auth";

export const runtime = "nodejs";

const inviteInput = z.object({ role: z.enum(INVITE_ROLES) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const parsed = inviteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return attachCookies(apiError(400, "Choose a role for the invite."), auth.setCookies);
  const db = await getDatabase();
  try {
    const invite = await runAsUser({ db, userId: auth.user.id }, async () => {
      await requireMember(id);
      return inviteToProject(db, {
        userId: auth.user.id,
        projectId: id,
        role: parsed.data.role,
        botUsername: process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "CertaApp_bot",
      });
    });
    return attachCookies(Response.json({ link: invite.link, role: invite.role }), auth.setCookies);
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
}
