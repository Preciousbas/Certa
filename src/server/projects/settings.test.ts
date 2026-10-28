import { createMemoryDatabase, memberships, projects, startOwnProject, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FORBIDDEN } from "../auth/errors.js";
import { setProjectPausedAs, updateProjectSettings } from "./settings.js";

describe("project settings", () => {
  it("lets the client update settings and pause, and refuses everyone else", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 9101n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 9102n, name: "Kemfor" }).returning())[0]!;
    const consultant = (await opened.db.insert(users).values({ telegramId: 9103n, name: "Okafor" }).returning())[0]!;
    const viewer = (await opened.db.insert(users).values({ telegramId: 9104n, name: "Bisi" }).returning())[0]!;
    const outsider = (await opened.db.insert(users).values({ telegramId: 9105n, name: "Tunde" }).returning())[0]!;
    await opened.db.insert(memberships).values([
      { projectId: created.projectId, userId: contractor.id, role: "contractor" },
      { projectId: created.projectId, userId: consultant.id, role: "consultant" },
      { projectId: created.projectId, userId: viewer.id, role: "viewer" },
    ]);
    const before = (await opened.db.select().from(projects).where(eq(projects.id, created.projectId)))[0]!;
    await updateProjectSettings(opened.db, {
      userId: created.userId,
      projectId: created.projectId,
      radius: 80,
      pin: { lat: 6.45, lng: 3.47 },
      disputeDays: 9,
      replyHours: 48,
    });
    await setProjectPausedAs(opened.db, { userId: created.userId, projectId: created.projectId, paused: true });
    const paused = (await opened.db.select().from(projects).where(eq(projects.id, created.projectId)))[0]!;
    expect(paused.geofenceRadiusM).toBe(80);
    expect(paused.siteLat).toBe(6.45);
    expect(paused.siteLng).toBe(3.47);
    expect(paused.sitePinSource).toBe("manual");
    expect(paused.disputeTimeoutDays).toBe(9);
    expect(paused.changeReplyHours).toBe(48);
    expect(paused.status).toBe("paused");
    await setProjectPausedAs(opened.db, { userId: created.userId, projectId: created.projectId, paused: false });
    expect((await opened.db.select().from(projects).where(eq(projects.id, created.projectId)))[0]?.status).toBe("active");
    const unchanged = {
      geofenceRadiusM: paused.geofenceRadiusM,
      siteLat: paused.siteLat,
      siteLng: paused.siteLng,
      sitePinSource: paused.sitePinSource,
      disputeTimeoutDays: paused.disputeTimeoutDays,
      changeReplyHours: paused.changeReplyHours,
    };
    for (const userId of [contractor.id, consultant.id, viewer.id, outsider.id]) {
      await expect(
        updateProjectSettings(opened.db, {
          userId,
          projectId: created.projectId,
          radius: 25,
          pin: null,
          disputeDays: 1,
          replyHours: 1,
        }),
      ).rejects.toBe(FORBIDDEN);
      await expect(setProjectPausedAs(opened.db, { userId, projectId: created.projectId, paused: true })).rejects.toBe(FORBIDDEN);
    }
    const after = (await opened.db.select().from(projects).where(eq(projects.id, created.projectId)))[0]!;
    expect({
      geofenceRadiusM: after.geofenceRadiusM,
      siteLat: after.siteLat,
      siteLng: after.siteLng,
      sitePinSource: after.sitePinSource,
      disputeTimeoutDays: after.disputeTimeoutDays,
      changeReplyHours: after.changeReplyHours,
    }).toEqual(unchanged);
    expect(after.status).toBe("active");
    expect(before.id).toBe(created.projectId);
    await opened.close();
  });
});
