import { createMemoryDatabase } from "@certa/db";
import { describe, expect, it } from "vitest";
import { proposeVariation } from "./propose.js";

describe("propose variation", () => {
  it("creates a change and queues B-VA-2 for the other party", async () => {
    const { db, close } = await createMemoryDatabase();
    const [client] = await db.insert((await import("@certa/db")).users).values({ telegramId: 501n, name: "Ada Client" }).returning();
    const [contractor] = await db
      .insert((await import("@certa/db")).users)
      .values({ telegramId: 502n, name: "Emeka Builder" })
      .returning();
    if (!client || !contractor) throw new Error("users missing");
    const { workspaces, projects, memberships, notifications } = await import("@certa/db");
    const [workspace] = await db
      .insert(workspaces)
      .values({ ownerUserId: client.id, name: "Workspace", company: "Workspace" })
      .returning();
    if (!workspace) throw new Error("workspace missing");
    const [project] = await db
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        name: "Test house",
        siteLocation: "Lagos",
        siteLat: 6.5,
        siteLng: 3.4,
        geofenceRadiusM: 150,
        fxRateLocked: 133111n,
        fxSource: "test",
        spendingCapUsdc: 1n,
        retentionBps: 500,
        defectsPeriodDays: 180,
        contractSumKobo: 100n,
        contractSumUsdc: 1n,
      })
      .returning();
    if (!project) throw new Error("project missing");
    await db.insert(memberships).values([
      { projectId: project.id, userId: client.id, role: "client" },
      { projectId: project.id, userId: contractor.id, role: "contractor" },
    ]);
    const sent = await proposeVariation(db, {
      projectId: project.id,
      actorUserId: client.id,
      title: "Extra soak pit",
      description: "Add a soak pit beside the existing drain at the rear fence.",
      type: "add",
      amountKobo: 25000000n,
      stageId: "new",
    });
    expect(sent.otherName).toBe("Emeka Builder");
    const notes = await db.select().from(notifications);
    expect(notes.some((row) => row.kind === "B-VA-2" && row.userId === contractor.id)).toBe(true);
    expect(notes.some((row) => row.userId === client.id && row.kind === "B-VA-2")).toBe(false);
    await close();
  });
});
