import { getDatabase, startOwnProject, STARTER_ROLES } from "@certa/db";
import { z } from "zod";
import { attachCookies } from "../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../src/server/auth/errors";
import { apiError } from "../../../lib/schemas";
import { requireUser } from "../../../lib/with-auth";

export const runtime = "nodejs";

const startInput = z
  .object({
    name: z.string().trim().min(1).max(180),
    role: z.enum(STARTER_ROLES),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const parsed = startInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return attachCookies(apiError(400, "Name the project and choose your role."), auth.setCookies);
  }
  try {
    const db = await getDatabase();
    const started = await startOwnProject(db, {
      telegramId: auth.user.telegramId,
      name: auth.user.name,
      projectName: parsed.data.name,
      role: parsed.data.role,
    });
    return attachCookies(Response.json({ projectId: started.projectId, role: started.role }), auth.setCookies);
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
}
