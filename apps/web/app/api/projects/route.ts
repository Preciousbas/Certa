import { getDatabase, startOwnProject, CONTRACT_SIDES } from "@certa/db";
import { joinDeepLink } from "@certa/shared";
import { z } from "zod";
import { attachCookies } from "../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../src/server/auth/errors";
import { allows } from "../../../../../src/server/auth/matrix";
import { isRole } from "../../../../../src/server/auth/rbac";
import { listMemberProjects } from "../../../lib/member-projects";
import { apiError } from "../../../lib/schemas";
import { requireUser } from "../../../lib/with-auth";

export const runtime = "nodejs";

const startInput = z
  .object({
    name: z.string().trim().min(1).max(180),
    role: z.enum(CONTRACT_SIDES),
  })
  .strict();

function botName(): string {
  return process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "CertaApp_bot";
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const db = await getDatabase();
    const rows = await listMemberProjects(db, auth.user.id);
    const visible = rows.map((row) => ({
      projectId: row.project.id,
      name: row.project.name,
      role: row.role,
      canInvite: isRole(row.role) && allows(row.role, "invite_extra"),
    }));
    return attachCookies(Response.json({ projects: visible }), auth.setCookies);
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const parsed = startInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return attachCookies(apiError(400, "Name the project and choose your side."), auth.setCookies);
  }
  try {
    const db = await getDatabase();
    const started = await startOwnProject(db, {
      telegramId: auth.user.telegramId,
      name: auth.user.name,
      projectName: parsed.data.name,
      role: parsed.data.role,
    });
    return attachCookies(
      Response.json({
        projectId: started.projectId,
        role: started.role,
        inviteRole: started.inviteRole,
        link: joinDeepLink(botName(), started.inviteCode),
        code: started.inviteCode,
      }),
      auth.setCookies,
    );
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
}
