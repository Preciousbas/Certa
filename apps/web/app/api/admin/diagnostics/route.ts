import { getDatabase } from "@certa/db";
import { loadDiagnostics } from "../../../../../../src/server/admin/diagnostics";
import { adminDenied } from "../../../../../../src/server/auth/admin-access";
import { authenticate, attachCookies } from "../../../../../../src/server/auth/authenticate";
import { requirePlatformAdmin, runAsUser } from "../../../../../../src/server/auth/rbac";
import { apiError, emptyQuery, queryOf } from "../../../../lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  try {
    const auth = await authenticate(request);
    await runAsUser({ db: await getDatabase(), userId: auth.user.id }, () => requirePlatformAdmin());
    const diagnostics = await loadDiagnostics();
    return attachCookies(Response.json(diagnostics), auth.setCookies);
  } catch (error) {
    return adminDenied(error);
  }
}
