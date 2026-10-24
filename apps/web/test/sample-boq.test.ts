import { readFileSync } from "node:fs";
import { createMemoryDatabase, extractions, projects, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { extractDocumentJob, ingestDocument, parseDocumentJob } from "../../../src/server/intake/flow";
import { interpretGrid } from "../../../src/server/intake/interpret";
import { parseXlsx } from "../../../src/server/intake/parseXlsx";
import { validateDraft } from "../../../src/server/intake/validate";

const bytes = new Uint8Array(readFileSync(new URL("./fixtures/sample-boq.xlsx", import.meta.url)));

describe("sample BOQ spreadsheet", () => {
  it("reads six priced lines, the naira total, 5% retention and 16 weeks", async () => {
    const document = await parseXlsx(bytes);
    expect(document.sheetNames).toEqual(["BOQ"]);
    const draft = interpretGrid(document.rows);
    const items = draft.bills.flatMap((bill) => bill.items.filter((item) => item.rowKind === "item"));
    expect(items).toHaveLength(6);
    expect(items.map((item) => item.statedKobo)).toEqual([
      36_000_000n,
      54_000_000n,
      78_000_000n,
      551_000_000n,
      589_000_000n,
      462_000_000n,
    ]);
    expect(() => validateDraft(draft, 0n)).not.toThrow();
    const plan = validateDraft(draft, 150_000n);
    expect(plan.currency).toBe("NGN");
    expect(plan.contractSumKobo).toBe(1_770_000_000n);
    expect(plan.retentionBps).toBe(500);
    expect(plan.durationWeeks).toBe(16);
    expect(plan.issues.filter((issue) => issue.severity === "blocking" && issue.code !== "V12")).toEqual([]);
  });

  it("saves that extraction from the queued document job", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.AI_DOC_API_KEY;
    delete process.env.LLM_API_KEY;
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88001n,
        name: "Ada",
        projectName: "Sample BOQ",
        role: "client",
      });
      await opened.db.update(projects).set({ fxRateLocked: 150_000n, fxSource: "test" }).where(eq(projects.id, started.projectId));
      const ingested = await ingestDocument(opened.db, {
        projectId: started.projectId,
        workspaceId: started.workspaceId,
        userId: started.userId,
        fileName: "sample-boq.xlsx",
        bytes,
      });
      expect(ingested.ok).toBe(true);
      if (!ingested.ok) return;
      await parseDocumentJob(opened.db, ingested.documentId);
      const plan = await extractDocumentJob(opened.db, started.projectId);
      expect(plan?.contractSumKobo).toBe(1_770_000_000n);
      expect(plan?.retentionBps).toBe(500);
      expect(plan?.durationWeeks).toBe(16);
      const saved = (await opened.db.select().from(extractions).where(eq(extractions.projectId, started.projectId)))[0];
      expect(saved?.status).toBe("succeeded");
      const validated = saved?.validatedJson as {
        contractSumKobo?: string;
        retentionBps?: number;
        durationWeeks?: number;
        currency?: string;
        stages?: unknown[];
        items?: { description: string; amountKobo: string }[];
      };
      expect(validated.currency).toBe("NGN");
      expect(validated.contractSumKobo).toBe("1770000000");
      expect(validated.retentionBps).toBe(500);
      expect(validated.durationWeeks).toBe(16);
      expect(validated.stages).toHaveLength(1);
      expect(validated.items).toHaveLength(6);
      expect(validated.items?.map((item) => item.amountKobo)).toEqual([
        "36000000",
        "54000000",
        "78000000",
        "551000000",
        "589000000",
        "462000000",
      ]);
      const { figuresReady } = await import("../../../src/server/intake/messages");
      const summary = figuresReady({
        project: "Sample BOQ",
        sum: "₦17,700,000",
        vatPct: "0",
        stages: validated.stages?.length ?? 0,
        retentionPct: "5",
        months: 6,
        warnings: 0,
        link: "https://certa.example/review",
        lines: (validated.items ?? []).map((item, index) => `${index + 1}. ${item.description}`),
      });
      expect(summary).toContain("1 stage");
      expect(summary).not.toContain("1 stages");
      expect(summary.split("\n").filter((line) => /^\d+\. /.test(line))).toHaveLength(6);
    } finally {
      await opened.close();
    }
  });
});
