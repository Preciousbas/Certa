import { botSessions, getDatabase, joinCodes, memberships, parties, payments, projects, stages } from "@certa/db";
import { usdcFromNgnKobo } from "@certa/shared";
import { eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const RATE = 150_000n;
const KOBO = 100_000_000n;
const TX = `0x${"ab".repeat(32)}`;

const bodySchema = z.object({
  action: z.enum(["reset", "stage", "review", "release"]),
  projectId: z.string().uuid().optional(),
});

function closed() {
  return new Response(null, { status: 404 });
}

/** Memory-database setup for Playwright journeys. Absent unless PLAYWRIGHT=1. */
export async function POST(request: Request) {
  if (process.env.PLAYWRIGHT !== "1") return closed();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return closed();
  const db = await getDatabase();
  if (parsed.data.action === "reset") {
    const extra = or(isNull(projects.termsHash), ne(projects.termsHash, "seeded-terms"));
    const ids = (await db.select({ id: projects.id }).from(projects).where(extra)).map((row) => row.id);
    if (ids.length > 0) {
      await db.delete(payments).where(inArray(payments.projectId, ids));
      await db.delete(stages).where(inArray(stages.projectId, ids));
      await db.delete(joinCodes).where(inArray(joinCodes.projectId, ids));
      await db.delete(memberships).where(inArray(memberships.projectId, ids));
      await db.delete(parties).where(inArray(parties.projectId, ids));
      await db.update(botSessions).set({ activeProjectId: null }).where(inArray(botSessions.activeProjectId, ids));
      await db.delete(projects).where(inArray(projects.id, ids));
    }
    return new Response(null, { status: 204 });
  }
  const projectId = parsed.data.projectId;
  if (!projectId) return closed();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project || project.termsHash === "seeded-terms") return closed();
  if (parsed.data.action === "stage") {
    const usdc = usdcFromNgnKobo(KOBO, RATE);
    const [stage] = await db
      .insert(stages)
      .values({
        projectId: project.id,
        workspaceId: project.workspaceId,
        stageIndex: 0,
        name: "Ground slab",
        amountNgnKobo: KOBO,
        amountUsdc: usdc,
        retentionBps: 0,
        status: "not_started",
        funded: false,
        onChainIdx: 0,
      })
      .returning();
    await db
      .update(projects)
      .set({
        fxRateLocked: RATE,
        fxSource: "manual",
        fxLockedAt: new Date(),
        contractSumKobo: KOBO,
        contractSumUsdc: usdc,
        status: "active",
      })
      .where(eq(projects.id, project.id));
    return Response.json({ projectId: project.id, stageId: stage?.id, stageIndex: 0 });
  }
  const stage = (await db.select().from(stages).where(eq(stages.projectId, project.id)))[0];
  if (!stage) return closed();
  if (parsed.data.action === "review") {
    await db.update(stages).set({ status: "submitted" }).where(eq(stages.id, stage.id));
    return Response.json({ projectId: project.id, stageId: stage.id });
  }
  await db.update(stages).set({ status: "released", funded: true }).where(eq(stages.id, stage.id));
  await db.insert(payments).values({
    stageId: stage.id,
    projectId: project.id,
    workspaceId: project.workspaceId,
    kind: "release",
    amountUsdc: stage.amountUsdc,
    amountNgnKobo: stage.amountNgnKobo,
    txHash: TX,
    status: "confirmed",
    idempotencyKey: `journey-release-${stage.id}`,
  });
  return Response.json({ projectId: project.id, stageId: stage.id, txHash: TX });
}
