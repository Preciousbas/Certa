import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../../packages/db/src/client.js";
import { contractVersions, memberships, projects, users, workspaces } from "../../packages/db/src/schema.js";
import { acceptPlan, extractDocumentJob, ingestDocument, parseDocumentJob, sendPlan } from "../../src/server/intake/flow.js";

describe("intake acceptance", () => {
  it("stores both acceptances and refuses to edit an accepted version", async () => {
    const opened = await createMemoryDatabase();
    const { db } = opened;
    const [client] = await db.insert(users).values({ telegramId: 41n, name: "Ada Client" }).returning();
    const [contractor] = await db.insert(users).values({ telegramId: 42n, name: "Emmy" }).returning();
    const [workspace] = await db.insert(workspaces).values({ ownerUserId: client!.id, name: "Ada", company: "Ada" }).returning();
    const [project] = await db.insert(projects).values({
      workspaceId: workspace!.id,
      name: "Sample duplex",
      siteLocation: "Lekki",
      siteLat: 6.4,
      siteLng: 3.4,
      geofenceRadiusM: 150,
      fxRateLocked: 133111n,
      fxSource: "manual",
      spendingCapUsdc: 1n,
      retentionBps: 0,
      defectsPeriodDays: 180,
      contractSumKobo: 1n,
      contractSumUsdc: 1n,
    }).returning();
    await db.insert(memberships).values([
      { projectId: project!.id, userId: client!.id, role: "client" },
      { projectId: project!.id, userId: contractor!.id, role: "contractor" },
    ]);
    const bytes = new Uint8Array(readFileSync(new URL("../fixtures/boq/duplex_lekki_sample.csv", import.meta.url)));
    const ingested = await ingestDocument(db, {
      projectId: project!.id,
      workspaceId: workspace!.id,
      userId: client!.id,
      fileName: "duplex_lekki_sample.csv",
      bytes,
    });
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    await parseDocumentJob(db, ingested.documentId);
    const plan = await extractDocumentJob(db, project!.id);
    expect(plan?.contractSumKobo).toBe(5525500000n);
    const sent = await sendPlan(db, { projectId: project!.id, userId: client!.id });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const clientAccept = await acceptPlan(db, { projectId: project!.id, userId: client!.id, role: "client", decision: "accepted" });
    const both = await acceptPlan(db, { projectId: project!.id, userId: contractor!.id, role: "contractor", decision: "accepted" });
    expect(clientAccept.ok && both.ok && both.both).toBe(true);
    if (!clientAccept.ok || !both.ok) return;
    expect(clientAccept.hash).toBe(both.hash);
    await expect(db.update(contractVersions).set({ contractSumKobo: 1n }).where(eq(contractVersions.projectId, project!.id))).rejects.toSatisfy((error: unknown) => {
      const parts: string[] = [];
      let current: unknown = error;
      while (current && parts.length < 6) {
        parts.push(current instanceof Error ? `${current.name}: ${current.message}` : String(current));
        current = current instanceof Error ? current.cause : undefined;
      }
      if (!parts.join("\n").toLowerCase().includes("locked")) throw new Error(parts.join("\n"));
      return true;
    });
    const updated = (await db.select().from(projects).where(eq(projects.id, project!.id)))[0];
    expect(updated?.status).toBe("active");
    expect(updated?.currentContractVersionId).toBeTruthy();
    await opened.close();
  });
});
