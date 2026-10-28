import { contractAcceptances, contractVersions, createMemoryDatabase, documents, memberships, stages, startOwnProject, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { callbackData } from "./callbacks.js";
import { handleIncoming } from "./engine.js";

describe("accept once", () => {
  it("ignores an old plan button and a second accept", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 71n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 72n, name: "Kemfor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: contractor.id, role: "contractor" });
    const old = (await opened.db.insert(contractVersions).values({
      projectId: created.projectId, version: 1, status: "superseded", contractSumKobo: 1n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1n, terms: {}, documentHashes: [], contentHash: "old", createdBy: created.userId,
    }).returning())[0]!;
    const latest = (await opened.db.insert(contractVersions).values({
      projectId: created.projectId, version: 2, status: "pending_acceptance", contractSumKobo: 2n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1n, terms: {}, documentHashes: [], contentHash: "new", retentionBps: 500, defectsPeriodDays: 180, createdBy: created.userId,
    }).returning())[0]!;
    await opened.db.insert(stages).values({
      projectId: created.projectId, workspaceId: created.workspaceId, contractVersionId: latest.id, stageIndex: 0, onChainIdx: 0, name: "One", amountNgnKobo: 2n, amountUsdc: 2n, retentionBps: 500,
    });
    const stale = await handleIncoming(opened.db, { type: "callback", data: callbackData("ac", old.id, "yes"), from: { id: 71, firstName: "Ada" } }, {});
    expect(stale.messages.map((message) => message.text).join("\n")).toContain("This plan changed");
    const rows = await opened.db.select().from(contractAcceptances).where(eq(contractAcceptances.contractVersionId, old.id));
    expect(rows).toHaveLength(0);
    const once = await handleIncoming(opened.db, { type: "callback", data: callbackData("ac", latest.id, "yes"), from: { id: 71, firstName: "Ada" } }, {});
    expect(once.messages.map((message) => message.text).join("\n") + (once.edit?.text ?? "")).toContain("Waiting for Kemfor");
    const twice = await handleIncoming(opened.db, { type: "callback", data: callbackData("ac", latest.id, "yes"), from: { id: 71, firstName: "Ada" } }, {});
    expect((twice.edit?.text ?? "") + twice.messages.map((message) => message.text).join("\n")).toContain("already accepted");
    const accepted = await opened.db.select().from(contractAcceptances).where(eq(contractAcceptances.contractVersionId, latest.id));
    expect(accepted).toHaveLength(1);
    const outside = await handleIncoming(opened.db, { type: "document", fileName: "boq.pdf", bytes: new Uint8Array([1]), from: { id: 71, firstName: "Ada" } }, {
      ingest: async () => ({ ok: true, pagesOrSheets: "1 page" }),
    });
    expect(outside.messages.map((message) => message.text).join("\n")).not.toContain("accepted");
    const versions = await opened.db.select().from(contractVersions).where(eq(contractVersions.projectId, created.projectId));
    expect(versions.some((row) => row.status === "accepted")).toBe(false);
    void documents;
    await opened.close();
  });
});
