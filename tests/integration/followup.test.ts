import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "../../packages/db/src/client.js";
import { documentChunks, extractions, memberships, projects, users, workspaces } from "../../packages/db/src/schema.js";
import { extractDocumentJob, ingestDocument, parseDocumentJob, sendPlan } from "../../src/server/intake/flow.js";
import { deliverContractReply } from "../../src/server/intake/notify.js";

const csv = new TextEncoder().encode(`Client,Ada
Contractor,Emmy
Bill,1,Doors
Item,Description,Unit,Qty,Rate,Amount
1.1,Door,nr,1,1000.00,1000.00
`);

describe("saved extraction checks", () => {
  it("stores a V14 issue and refuses to send when a quote is missing", async () => {
    const previous = { model: process.env.AI_DOC_MODEL, key: process.env.AI_DOC_API_KEY, llm: process.env.LLM_API_KEY };
    delete process.env.AI_DOC_MODEL;
    delete process.env.AI_DOC_API_KEY;
    delete process.env.LLM_API_KEY;
    const opened = await createMemoryDatabase();
    const { db } = opened;
    const [client] = await db.insert(users).values({ telegramId: 81n, name: "Ada Client" }).returning();
    const [workspace] = await db.insert(workspaces).values({ ownerUserId: client!.id, name: "Ada", company: "Ada" }).returning();
    const [project] = await db.insert(projects).values({
      workspaceId: workspace!.id,
      name: "Citation check",
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
    const ingested = await ingestDocument(db, {
      projectId: project!.id,
      workspaceId: workspace!.id,
      userId: client!.id,
      fileName: "door.csv",
      bytes: csv,
    });
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) return;
    await parseDocumentJob(db, ingested.documentId);
    await db.update(documentChunks).set({ content: "redacted" }).where(eq(documentChunks.documentId, ingested.documentId));
    await extractDocumentJob(db, project!.id);
    const saved = (await db.select().from(extractions).where(eq(extractions.projectId, project!.id)))[0];
    const issues = saved?.issues as { code?: string }[];
    expect(issues.some((issue) => issue.code === "V14")).toBe(true);
    const validated = saved?.validatedJson as { source?: string };
    expect(validated.source).toBe("parser");
    const sent = await sendPlan(db, { projectId: project!.id, userId: client!.id });
    expect(sent.ok).toBe(false);
    if (previous.model === undefined) delete process.env.AI_DOC_MODEL;
    else process.env.AI_DOC_MODEL = previous.model;
    if (previous.key === undefined) delete process.env.AI_DOC_API_KEY;
    else process.env.AI_DOC_API_KEY = previous.key;
    if (previous.llm === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous.llm;
    await opened.close();
  });

  it("notifies both parties once for the 72 hour reply", async () => {
    const opened = await createMemoryDatabase();
    const { db } = opened;
    const [client] = await db.insert(users).values({ telegramId: 91n, name: "Ada Client" }).returning();
    const [contractor] = await db.insert(users).values({ telegramId: 92n, name: "Emmy" }).returning();
    const [workspace] = await db.insert(workspaces).values({ ownerUserId: client!.id, name: "Ada", company: "Ada" }).returning();
    const [project] = await db.insert(projects).values({
      workspaceId: workspace!.id,
      name: "Reply check",
      siteLocation: "Lekki",
      siteLat: 6.4,
      siteLng: 3.4,
      geofenceRadiusM: 150,
      fxRateLocked: 133111n,
      fxSource: "manual",
      spendingCapUsdc: 1n,
      retentionBps: 500,
      defectsPeriodDays: 180,
      contractSumKobo: 1n,
      contractSumUsdc: 1n,
    }).returning();
    await db.insert(memberships).values([
      { projectId: project!.id, userId: client!.id, role: "client" },
      { projectId: project!.id, userId: contractor!.id, role: "contractor" },
    ]);
    const sent: string[] = [];
    const send = async (chatId: string, text: string) => {
      sent.push(`${chatId}:${text}`);
    };
    expect(await deliverContractReply(db, { projectId: project!.id, versionId: "version-1", hoursLeft: 48, send })).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await deliverContractReply(db, { projectId: project!.id, versionId: "version-1", hoursLeft: 0, send })).toBe(2);
    expect(await deliverContractReply(db, { projectId: project!.id, versionId: "version-1", hoursLeft: 0, send })).toBe(0);
    expect(sent).toHaveLength(2);
    expect(sent.some((row) => row.startsWith("91:"))).toBe(true);
    expect(sent.some((row) => row.startsWith("92:"))).toBe(true);
    await opened.close();
  });
});
