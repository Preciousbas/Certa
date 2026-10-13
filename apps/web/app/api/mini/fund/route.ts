import { recordPayment, getDatabase, projects } from "@certa/db";

export async function POST() {
  const db = await getDatabase();
  const project = (await db.select().from(projects)).find((row) => row.name.startsWith("EM 22"));
  if (!project) return Response.json({ error: "No project." }, { status: 404 });
  const payment = await recordPayment(db, {
    projectId: project.id,
    workspaceId: project.workspaceId,
    kind: "stage",
    amountUsdc: project.contractSumUsdc,
    amountNgnKobo: project.contractSumKobo,
    idempotencyKey: `demo-fund:${project.id}`,
    status: "recorded",
  });
  return Response.json({ ok: true, created: payment.created, id: payment.payment.id });
}
