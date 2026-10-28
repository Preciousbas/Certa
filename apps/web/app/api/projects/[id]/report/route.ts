import { aiVerdicts, getDatabase, photos, projects, stages } from "@certa/db";
import { renderReportPdf } from "@certa/pdf";
import { eq } from "drizzle-orm";
import { attachCookies } from "../../../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../../../src/server/auth/errors";
import { requireMember, runAsUser } from "../../../../../../../src/server/auth/rbac";
import { formatNaira } from "../../../../../../../src/lib/money/kobo";
import { stageLocationNote } from "../../../../../../../src/server/site/note";
import { requireUser } from "../../../../../lib/with-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireUser(request);
  } catch (error) {
    return failureResponse(error);
  }
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  const db = await getDatabase();
  try {
    await runAsUser({ db, userId: auth.user.id }, () => requireMember(id));
  } catch (error) {
    return attachCookies(failureResponse(error), auth.setCookies);
  }
  const project = (await db.select().from(projects).where(eq(projects.id, id)))[0];
  if (!project) return new Response("No project is open.", { status: 404 });
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, project.id));
  const verdicts = (await db.select().from(aiVerdicts)).filter((row) => stageRows.some((stage) => stage.id === row.stageId));
  const week = verdicts.filter((row) => Date.now() - row.createdAt.getTime() < 7 * 86_400_000);
  const pass = week.filter((row) => row.verdict === "pass").length;
  const fail = week.filter((row) => row.verdict === "fail").length;
  const unsure = week.length - pass - fail;
  const released = stageRows.filter((stage) => stage.status === "released").reduce((sum, stage) => sum + stage.amountNgnKobo, 0n);
  const next = stageRows.find((stage) => stage.status !== "released")?.name ?? "none";
  const shots = await db.select().from(photos).where(eq(photos.projectId, project.id));
  const location = stageLocationNote(shots.map((shot) => ({
    distanceFromSiteM: shot.distanceFromSiteM,
    checks: shot.checksJson as { site_pin?: boolean; in_radius?: boolean },
  })));
  const line = `This week: ${week.length} photo sets checked (${pass} passed, ${fail} need work, ${unsure} need more photos); ${formatNaira(released)} paid out; next stage due: ${next}.`;
  const pdf = await renderReportPdf([project.name, line, location].filter(Boolean));
  return attachCookies(
    new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"report.pdf\"",
      },
    }),
    auth.setCookies,
  );
}
