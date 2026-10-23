import { getDatabase } from "@certa/db";
import { audit } from "../../../../../../src/server/audit";
import { authenticate, attachCookies } from "../../../../../../src/server/auth/authenticate";
import { adminDenied } from "../../../../../../src/server/auth/admin-access";
import { requirePlatformAdmin, runAsUser } from "../../../../../../src/server/auth/rbac";
import { emptyQuery, queryOf, apiError } from "../../../../lib/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  try {
    const auth = await authenticate(request);
    await runAsUser({ db: await getDatabase(), userId: auth.user.id }, () => requirePlatformAdmin());
    const db = await getDatabase();
    await audit(db, {
      action: "admin.view",
      entity: "admin",
      entityId: "api",
      actor: auth.user.id,
      actorKind: "admin",
    });
    return attachCookies(Response.json({ ok: true }), auth.setCookies);
  } catch (error) {
    return adminDenied(error);
  }
}
