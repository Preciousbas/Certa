import { changeRequests, disputes, getDatabase, parties, payments, projects, stages, users, workspaceMembers } from "@certa/db";
import { formatMoneyPair, formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { eq } from "drizzle-orm";
import { syncEscrow } from "./sync-escrow";

export async function loadProject() {
  const db = await getDatabase();
  const userRows = await db.select().from(users).where(eq(users.telegramId, 1001n));
  const user = userRows[0];
  const projectRows = await db.select().from(projects);
  const uploaded = projectRows
    .filter((row) => row.termsHash !== "seeded-terms")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const demo = projectRows.find((row) => row.termsHash === "seeded-terms");
  const project = uploaded[0] ?? (process.env.DEMO_SEED === "true" ? demo : undefined);
  if (!project) return null;
  const partyRows = await db.select().from(parties).where(eq(parties.projectId, project.id));
  const client = partyRows.find((row) => row.role === "client");
  const clientUser = client ? (await db.select().from(users).where(eq(users.id, client.userId)))[0] : undefined;
  const viewer = project.termsHash === "seeded-terms" ? user : (clientUser ?? user);
  if (!viewer) return null;
  await syncEscrow(project, db).catch(() => []);
  const storedStages = (await db.select().from(stages).where(eq(stages.projectId, project.id))).sort(
    (a, b) => a.stageIndex - b.stageIndex,
  );
  const stageRows = storedStages;
  const chainUsdc = stageRows.reduce((sum, stage) => sum + stage.amountUsdc, 0n);
  const moneyNote = null;
  const changes = await db.select().from(changeRequests).where(eq(changeRequests.projectId, project.id));
  const disputeRows = await db.select().from(disputes).where(eq(disputes.projectId, project.id));
  const paymentRows = await db.select().from(payments).where(eq(payments.projectId, project.id));
  const membership = (
    await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, viewer.id))
  ).find((row) => row.workspaceId === project.workspaceId);
  return {
    project,
    user: viewer,
    stages: stageRows,
    moneyNote,
    shownKobo: stageRows.reduce((sum, stage) => sum + stage.amountNgnKobo, 0n),
    shownUsdc: chainUsdc,
    changes,
    disputes: disputeRows,
    parties: partyRows,
    payments: paymentRows,
    workspaceRole: membership?.role,
    isDemo: project.termsHash === "seeded-terms",
    pair: formatMoneyPair(project.contractSumKobo, project.fxRateLocked),
    ngn: formatNgnFromKobo(project.contractSumKobo),
    usdc: formatUsdc(project.contractSumUsdc),
  };
}
