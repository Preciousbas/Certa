import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryDatabase, withRole } from "./client.js";
import { parties, projects, stages, users, workspaceMembers, workspaces } from "./schema.js";
import { fxRateFromNaira, nairaToKobo, usdcFromNgnKobo } from "@certa/shared";

describe("row level security", () => {
  it("stops user A reading project B as the app role", async () => {
    const { db, close } = await createMemoryDatabase();
    const [clientA] = await db.insert(users).values({ telegramId: 1n, name: "Client A" }).returning();
    const [clientB] = await db.insert(users).values({ telegramId: 2n, name: "Client B" }).returning();
    const [sub] = await db.insert(users).values({ telegramId: 3n, name: "Sub A" }).returning();
    if (!clientA || !clientB || !sub) throw new Error("users missing");

    const rate = fxRateFromNaira(1500n);
    const sum = nairaToKobo(45_000_000n);
    const [wsA] = await db.insert(workspaces).values({ ownerUserId: clientA.id, name: "A", company: "A Ltd" }).returning();
    const [wsB] = await db.insert(workspaces).values({ ownerUserId: clientB.id, name: "B", company: "B Ltd" }).returning();
    if (!wsA || !wsB) throw new Error("workspaces missing");
    await db.insert(workspaceMembers).values([
      { workspaceId: wsA.id, userId: clientA.id, role: "owner" },
      { workspaceId: wsB.id, userId: clientB.id, role: "owner" },
    ]);
    const projectValues = {
      siteLocation: "Lekki",
      siteLat: 6.45,
      siteLng: 3.47,
      geofenceRadiusM: 150,
      fxRateLocked: rate,
      fxSource: "test",
      spendingCapUsdc: usdcFromNgnKobo(nairaToKobo(5_000_000n), rate),
      retentionBps: 500,
      defectsPeriodDays: 180,
      contractSumKobo: sum,
      contractSumUsdc: usdcFromNgnKobo(sum, rate),
    };
    const [projA] = await db.insert(projects).values({ ...projectValues, workspaceId: wsA.id, name: "Project A" }).returning();
    const [projB] = await db.insert(projects).values({ ...projectValues, workspaceId: wsB.id, name: "Project B" }).returning();
    if (!projA || !projB) throw new Error("projects missing");
    const [party] = await db.insert(parties).values({
      projectId: projA.id,
      workspaceId: wsA.id,
      userId: sub.id,
      role: "subcontractor",
    }).returning();
    if (!party) throw new Error("party missing");
    await db.insert(stages).values({
      projectId: projA.id,
      workspaceId: wsA.id,
      stageIndex: 0,
      name: "Clearing",
      amountNgnKobo: 1n,
      amountUsdc: 1n,
      retentionBps: 500,
      onChainIdx: 0,
      assignedPartyId: party.id,
    });
    await db.insert(stages).values({
      projectId: projB.id,
      workspaceId: wsB.id,
      stageIndex: 0,
      name: "Secret stage",
      amountNgnKobo: 1n,
      amountUsdc: 1n,
      retentionBps: 500,
      onChainIdx: 0,
    });

    const asSub = await withRole(db, { userId: sub.id }, (tx) => tx.select().from(projects));
    expect(asSub.map((row) => row.name)).toEqual(["Project A"]);

    const asClientB = await withRole(db, { userId: clientB.id, workspaceId: wsB.id, workspaceRole: "owner" }, (tx) =>
      tx.select().from(projects).where(eq(projects.id, projA.id)),
    );
    expect(asClientB).toHaveLength(0);

    const subStages = await withRole(db, { userId: sub.id }, (tx) => tx.select().from(stages));
    expect(subStages).toHaveLength(1);
    expect(subStages[0]?.name).toBe("Clearing");

    await close();
  });
});
