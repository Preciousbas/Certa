import { readFileSync } from "node:fs";
import { createMemoryDatabase, documents, extractions, jobs, projects, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { enqueueExtraction, extractDocumentJob, ingestDocument, parseDocumentJob } from "./flow.js";

const bytes = new Uint8Array(readFileSync(new URL("../../../apps/web/test/fixtures/sample-boq.xlsx", import.meta.url)));

describe("duplicate spreadsheets", () => {
  it("reads 3 copies of one file as 6 lines and NGN 17,700,000, and still combines two different files", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.AI_DOC_API_KEY;
    delete process.env.LLM_API_KEY;
    const opened = await createMemoryDatabase();
    try {
      await opened.client.exec("DROP INDEX IF EXISTS documents_project_sha256");
      const started = await startOwnProject(opened.db, {
        telegramId: 88031n,
        name: "Ada",
        projectName: "Bruce QA",
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
      const parsedJob = (await opened.db.select().from(jobs).where(eq(jobs.dedupeKey, `parse:${ingested.documentId}`)))[0];
      expect(parsedJob?.status).toBe("succeeded");
      const original = (await opened.db.select().from(documents).where(eq(documents.id, ingested.documentId)))[0];
      if (!original) throw new Error("document");
      const later = new Date(original.createdAt.getTime() + 60_000);
      const newest = new Date(original.createdAt.getTime() + 120_000);
      await opened.db.insert(documents).values([
        {
          projectId: original.projectId,
          workspaceId: original.workspaceId,
          kind: original.kind,
          storageKey: `${original.storageKey}-b`,
          sha256: original.sha256,
          parsedJson: original.parsedJson,
          parseStatus: "parsed",
          status: "parsed",
          fileName: original.fileName,
          uploadedBy: original.uploadedBy,
          createdAt: later,
        },
        {
          projectId: original.projectId,
          workspaceId: original.workspaceId,
          kind: original.kind,
          storageKey: `${original.storageKey}-c`,
          sha256: original.sha256,
          parsedJson: original.parsedJson,
          parseStatus: "failed",
          status: "failed",
          fileName: original.fileName,
          uploadedBy: original.uploadedBy,
          createdAt: newest,
        },
      ]);
      await enqueueExtraction(opened.db, started.projectId);
      await opened.db.update(jobs).set({ status: "running" }).where(eq(jobs.kind, "extract_contract"));
      const plan = await extractDocumentJob(opened.db, started.projectId);
      expect(plan?.contractSumKobo).toBe(1_770_000_000n);
      const saved = (await opened.db.select().from(extractions).where(eq(extractions.projectId, started.projectId)))[0];
      const validated = saved?.validatedJson as { contractSumKobo?: string; items?: { description: string }[] };
      expect(validated.items).toHaveLength(6);
      expect(validated.contractSumKobo).toBe("1770000000");
      expect(saved?.documentIds).toHaveLength(1);
      const extractJob = (await opened.db.select().from(jobs).where(eq(jobs.kind, "extract_contract")))[0];
      expect(extractJob?.status).toBe("succeeded");

      const different = JSON.parse(JSON.stringify(original.parsedJson)) as { rows: { content: string }[] };
      different.rows[0]!.content = `${different.rows[0]?.content ?? ""} other file`;
      await opened.db.insert(documents).values({
        projectId: original.projectId,
        workspaceId: original.workspaceId,
        kind: original.kind,
        storageKey: `${original.storageKey}-other`,
        sha256: "b".repeat(64),
        parsedJson: different,
        parseStatus: "parsed",
        status: "parsed",
        fileName: "other.xlsx",
        uploadedBy: original.uploadedBy,
        createdAt: new Date(newest.getTime() + 60_000),
      });
      const combined = await extractDocumentJob(opened.db, started.projectId);
      const again = (await opened.db.select().from(extractions).where(eq(extractions.projectId, started.projectId)));
      const latest = again[again.length - 1];
      const combinedItems = (latest?.validatedJson as { items?: unknown[] } | null)?.items ?? [];
      expect(combined?.contractSumKobo).not.toBe(1_770_000_000n);
      expect(combinedItems.length).toBeGreaterThan(6);
      expect(latest?.documentIds).toHaveLength(2);
    } finally {
      await opened.close();
    }
  });
});
