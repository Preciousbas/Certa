import { readFileSync } from "node:fs";
import { createMemoryDatabase, contractVersions, extractions, memberships, projects, stages, users, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { allocateMicro } from "../../src/lib/money/fx.js";
import { contentHash } from "../../src/server/intake/hash.js";
import { acceptPlan, extractDocumentJob, ingestDocument, parseDocumentJob, sendPlan } from "../../src/server/intake/flow.js";
import { editStages } from "../../src/server/intake/review.js";
import { rowsToCsv, blockARows } from "./fixtures/lekki-blocks.js";

const bytes = new TextEncoder().encode(rowsToCsv(blockARows));

async function projectWith(fileName: string, fileBytes: Uint8Array) {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.AI_DOC_API_KEY;
  delete process.env.LLM_API_KEY;
  const opened = await createMemoryDatabase();
  const started = await startOwnProject(opened.db, {
    telegramId: 88011n,
    name: "Genius",
    projectName: "Stages",
    role: "client",
  });
  await opened.db.update(projects).set({ fxRateLocked: 150_000n, fxSource: "test" }).where(eq(projects.id, started.projectId));
  const [contractor] = await opened.db.insert(users).values({ telegramId: 88012n, name: "Precious" }).returning();
  if (!contractor) throw new Error("contractor");
  await opened.db.insert(memberships).values({ projectId: started.projectId, userId: contractor.id, role: "contractor" });
  const ingested = await ingestDocument(opened.db, {
    projectId: started.projectId,
    workspaceId: started.workspaceId,
    userId: started.userId,
    fileName,
    bytes: fileBytes,
  });
  if (!ingested.ok) throw new Error(ingested.message ?? "ingest");
  await parseDocumentJob(opened.db, ingested.documentId);
  await extractDocumentJob(opened.db, started.projectId);
  return { ...opened, ...started, contractorId: contractor.id };
}

type Saved = {
  contractSumKobo?: string;
  koboPerUsdc?: string;
  retentionBps?: number;
  defectsPeriodDays?: number;
  spendingCapMicro?: string;
  stages?: { name: string; amountKobo: string; amountMicro: string; acceptanceCriteria: string[]; tags: string[]; kind: string; expectedFinish?: string | null }[];
  items?: { id: string; amountKobo: string; stageNumber?: number }[];
};

function savedOf(value: unknown): Saved {
  return value as Saved;
}

function totals(saved: Saved) {
  const amounts = (saved.stages ?? []).map((stage) => BigInt(stage.amountKobo));
  const micros = (saved.stages ?? []).map((stage) => BigInt(stage.amountMicro));
  return {
    kobo: amounts.reduce((sum, amount) => sum + amount, 0n),
    micro: micros.reduce((sum, amount) => sum + amount, 0n),
    priced: allocateMicro(amounts, BigInt(saved.koboPerUsdc ?? "150000")).reduce((sum, amount) => sum + amount, 0n),
  };
}

describe("stage edits", () => {
  it("keeps the contract sum and the USDC total after every edit", async () => {
    const opened = await projectWith("block-a.csv", bytes);
    try {
      const read = async () => savedOf((await opened.db.select().from(extractions).where(eq(extractions.projectId, opened.projectId)))[0]?.validatedJson);
      const before = read();
      const sum = BigInt((await before).contractSumKobo ?? "0");
      const check = async () => {
        const now = await read();
        const total = totals(now);
        expect(total.kobo).toBe(sum);
        expect(total.micro).toBe(total.priced);
      };
      const item = (await before).items?.find((row) => row.stageNumber === 1);
      expect(item?.id).toBeTruthy();
      const renamed = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "rename", number: 1, name: "Foundations" } });
      expect(renamed.ok).toBe(true);
      await check();
      const dated = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "set_finish", number: 1, date: "2026-12-01" } });
      expect(dated.ok).toBe(true);
      await check();
      const moved = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "move_item", itemId: item?.id, toNumber: 2 } });
      expect(moved.ok).toBe(true);
      await check();
      const merged = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "merge", number: 2 } });
      expect(merged.ok).toBe(true);
      await check();
      const removed = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "remove", number: 2, into: 1 } });
      expect(removed.ok).toBe(true);
      await check();
      const added = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "add", name: "Finishes" } });
      expect(added.ok).toBe(true);
      await check();
      const refused = await sendPlan(opened.db, { projectId: opened.projectId, userId: opened.userId });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.message).toMatch(/has no amount yet/);
      const cleared = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "remove", number: 2, into: 1 } });
      expect(cleared.ok).toBe(true);
      await check();
    } finally {
      await opened.close();
    }
  });

  it("hashes a plan with no finish dates the same way as before", async () => {
    const opened = await projectWith("block-a.csv", bytes);
    try {
      const sent = await sendPlan(opened.db, { projectId: opened.projectId, userId: opened.userId });
      expect(sent.ok).toBe(true);
      if (!sent.ok) return;
      const saved = savedOf((await opened.db.select().from(extractions).where(eq(extractions.projectId, opened.projectId)))[0]?.validatedJson);
      const project = (await opened.db.select().from(projects).where(eq(projects.id, opened.projectId)))[0];
      const version = (await opened.db.select().from(contractVersions).where(eq(contractVersions.projectId, opened.projectId)))[0];
      const again = contentHash({
        terms: { retention_bps: saved.retentionBps ?? 0, defects_period_days: saved.defectsPeriodDays ?? 180 },
        stages: (saved.stages ?? []).map((stage) => ({
          name: stage.name,
          amount_kobo: stage.amountKobo,
          amount_micro: stage.amountMicro,
          criteria: stage.acceptanceCriteria,
          tags: stage.tags,
        })),
        fx: { kobo_per_usdc: saved.koboPerUsdc ?? project?.fxRateLocked.toString() ?? "0", source: project?.fxSource ?? "", as_of: "2026-10-15" },
        cap: saved.spendingCapMicro ?? "1000000",
        retention: String(saved.retentionBps ?? 0),
        document_hashes: version?.documentHashes ?? [],
      });
      expect(again).toBe(sent.hash);
      expect((saved.stages ?? []).every((stage) => !stage.expectedFinish)).toBe(true);
    } finally {
      await opened.close();
    }
  });

  it("writes the finish date onto the stage row", async () => {
    const opened = await projectWith("block-a.csv", bytes);
    try {
      await editStages(opened.db, { projectId: opened.projectId, edit: { op: "set_finish", number: 1, date: "2026-12-01" } });
      const sent = await sendPlan(opened.db, { projectId: opened.projectId, userId: opened.userId });
      expect(sent.ok).toBe(true);
      const rows = await opened.db.select().from(stages).where(eq(stages.projectId, opened.projectId));
      expect(rows.some((row) => row.expectedFinish === "2026-12-01")).toBe(true);
    } finally {
      await opened.close();
    }
  });

  it("returns a sent plan to draft when the client edits it", async () => {
    const opened = await projectWith("block-a.csv", bytes);
    try {
      const sent = await sendPlan(opened.db, { projectId: opened.projectId, userId: opened.userId });
      expect(sent.ok).toBe(true);
      const edited = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "rename", number: 1, name: "Foundations" } });
      expect(edited.ok).toBe(true);
      if (edited.ok) expect(edited.message).toBe("You changed the plan after sending it. Tap Send to contractor for agreement again.");
      const version = (await opened.db.select().from(contractVersions).where(eq(contractVersions.projectId, opened.projectId)))[0];
      expect(version?.status).toBe("draft");
    } finally {
      await opened.close();
    }
  });

  it("refuses edits after both sides have accepted", async () => {
    const opened = await projectWith("block-a.csv", bytes);
    try {
      const sent = await sendPlan(opened.db, { projectId: opened.projectId, userId: opened.userId });
      expect(sent.ok).toBe(true);
      await acceptPlan(opened.db, { projectId: opened.projectId, userId: opened.userId, role: "client", decision: "accepted" });
      await acceptPlan(opened.db, { projectId: opened.projectId, userId: opened.contractorId, role: "contractor", decision: "accepted" });
      const edited = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "rename", number: 1, name: "Foundations" } });
      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.message).toBe("This plan is agreed. Propose a change instead — both sides must accept it.");
    } finally {
      await opened.close();
    }
  });

  it("refuses an edit to the reserve", async () => {
    const duplex = new Uint8Array(readFileSync(new URL("../fixtures/boq/duplex_lekki_sample.csv", import.meta.url)));
    const opened = await projectWith("duplex.csv", duplex);
    try {
      const saved = savedOf((await opened.db.select().from(extractions).where(eq(extractions.projectId, opened.projectId)))[0]?.validatedJson);
      const reserve = (saved.stages ?? []).find((stage) => stage.kind === "reserve");
      const number = (saved.stages ?? []).findIndex((stage) => stage.kind === "reserve") + 1;
      expect(reserve).toBeTruthy();
      const edited = await editStages(opened.db, { projectId: opened.projectId, edit: { op: "rename", number, name: "Changed" } });
      expect(edited.ok).toBe(false);
      if (!edited.ok) expect(edited.message).toBe("The reserve can't be edited.");
    } finally {
      await opened.close();
    }
  });
});
