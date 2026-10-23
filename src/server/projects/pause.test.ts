import { createMemoryDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PAUSED_MESSAGE, rejectIfPaused, setProjectPaused } from "./pause.js";

describe("pause project", () => {
  it("blocks while paused and allows again after resume", async () => {
    expect(rejectIfPaused("active")).toBeNull();
    const blocked = rejectIfPaused("paused");
    expect(blocked?.status).toBe(409);
    const body = (await blocked!.json()) as { message: string };
    expect(body.message).toBe(PAUSED_MESSAGE);

    const { db, close } = await createMemoryDatabase();
    const { users, workspaces } = await import("@certa/db");
    const [owner] = await db.insert(users).values({ telegramId: 77n, name: "Owner" }).returning();
    if (!owner) throw new Error("owner missing");
    const [workspace] = await db.insert(workspaces).values({ ownerUserId: owner.id, name: "W", company: "W" }).returning();
    if (!workspace) throw new Error("workspace missing");
    const [project] = await db
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        name: "Paused house",
        siteLocation: "Lagos",
        siteLat: 6,
        siteLng: 3,
        geofenceRadiusM: 150,
        fxRateLocked: 100n,
        fxSource: "test",
        spendingCapUsdc: 1n,
        retentionBps: 0,
        defectsPeriodDays: 1,
        contractSumKobo: 1n,
        contractSumUsdc: 1n,
      })
      .returning();
    if (!project) throw new Error("project missing");
    await setProjectPaused(db, project.id, true);
    const paused = (await db.select().from(projects).where(eq(projects.id, project.id)))[0];
    expect(paused?.status).toBe("paused");
    const again = rejectIfPaused(paused?.status ?? "");
    expect((await again?.json()) as { message: string }).toMatchObject({ message: PAUSED_MESSAGE });
    await setProjectPaused(db, project.id, false);
    const resumed = (await db.select().from(projects).where(eq(projects.id, project.id)))[0];
    expect(resumed?.status).toBe("active");
    expect(rejectIfPaused(resumed?.status ?? "")).toBeNull();
    await close();
  });
});
