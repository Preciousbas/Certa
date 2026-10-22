import { getDatabase, projects } from "@certa/db";
import { reconcileProject } from "../../../../../../src/server/chain/reconcile";
import { emptyQuery, queryOf, apiError } from "../../../../lib/schemas";
import { requireCronSecret } from "../../../../lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const db = await getDatabase();
  const rows = await db.select().from(projects);
  let checked = 0;
  let mismatches = 0;
  for (const project of rows) {
    if (!project.escrowAddress) continue;
    checked += 1;
    const result = await reconcileProject(db, project.id);
    mismatches += result.mismatches;
  }
  return Response.json({ ok: true, checked, mismatches });
}
