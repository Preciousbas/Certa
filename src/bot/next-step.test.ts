import { contractVersions, createMemoryDatabase, memberships, stages, startOwnProject, users } from "@certa/db";
import { describe, expect, it } from "vitest";
import { nextStep, fundMenuOpen } from "./flows/next.js";

describe("next step", () => {
  it("tells the client to invite the contractor first", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 41n, name: "Ada", projectName: "Plot", role: "client" });
    expect(await nextStep(opened.db, created.projectId, created.userId, "client")).toBe("Next: invite the contractor. Tap Invite people.");
    expect(await fundMenuOpen(opened.db, created.projectId)).toBe(false);
    await opened.close();
  });

  it("tells a lone contractor to invite the client", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 42n, name: "Kemfor", projectName: "Plot", role: "contractor" });
    expect(await nextStep(opened.db, created.projectId, created.userId, "contractor")).toBe("Next: invite the client. Tap Invite people.");
    expect(await nextStep(opened.db, created.projectId, created.userId, "subcontractor")).toBe("Next: invite the client. Tap Invite people.");
    await opened.close();
  });

  it("says every stage is paid once the work is released", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 43n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = await opened.db.insert(users).values({ telegramId: 44n, name: "Kemfor" }).returning();
    const consultant = await opened.db.insert(users).values({ telegramId: 45n, name: "Okafor" }).returning();
    await opened.db.insert(memberships).values([
      { projectId: created.projectId, userId: contractor[0]!.id, role: "contractor" },
      { projectId: created.projectId, userId: consultant[0]!.id, role: "consultant" },
    ]);
    await opened.db.insert(contractVersions).values({
      projectId: created.projectId, version: 1, status: "accepted", contractSumKobo: 100n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1n, terms: {}, documentHashes: [], contentHash: "abc", createdBy: created.userId,
    });
    await opened.db.insert(stages).values({
      projectId: created.projectId,
      workspaceId: created.workspaceId,
      stageIndex: 0,
      onChainIdx: 0,
      name: "Substructure",
      amountNgnKobo: 100n,
      amountUsdc: 100n,
      retentionBps: 0,
      status: "released",
      funded: true,
    });
    expect(await nextStep(opened.db, created.projectId, created.userId, "client")).toBe("All stages are paid.");
    await opened.close();
  });
});
