import { changeRequests, disputes, getDatabase, parties, projects, stages, users } from "@certa/db";
import { formatMoneyPair, formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { eq } from "drizzle-orm";

export async function loadProject() {
  const db = await getDatabase();
  const userRows = await db.select().from(users).where(eq(users.telegramId, 1001n));
  const user = userRows[0];
  const projectRows = await db.select().from(projects);
  const project = projectRows.find((row) => row.name.startsWith("EM 22"));
  if (!user || !project) return null;
  const stageRows = (await db.select().from(stages).where(eq(stages.projectId, project.id))).sort(
    (a, b) => a.stageIndex - b.stageIndex,
  );
  const changes = await db.select().from(changeRequests).where(eq(changeRequests.projectId, project.id));
  const disputeRows = await db.select().from(disputes).where(eq(disputes.projectId, project.id));
  const partyRows = await db.select().from(parties).where(eq(parties.projectId, project.id));
  return {
    project,
    user,
    stages: stageRows,
    changes,
    disputes: disputeRows,
    parties: partyRows,
    pair: formatMoneyPair(project.contractSumKobo, project.fxRateLocked),
    ngn: formatNgnFromKobo(project.contractSumKobo),
    usdc: formatUsdc(project.contractSumUsdc),
  };
}
