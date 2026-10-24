import { createMemoryDatabase, documents, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ingestDocument } from "./flow";

const bytes = new TextEncoder().encode("item,amount\nSlab,1000\n");

describe("resending a file", () => {
  it("replaces a failed copy instead of saving another and blocking it", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88011n,
        name: "Ada",
        projectName: "Resend",
        role: "client",
      });
      const first = await ingestDocument(opened.db, {
        projectId: started.projectId,
        workspaceId: started.workspaceId,
        userId: started.userId,
        fileName: "boq.csv",
        bytes,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await opened.db.update(documents).set({ status: "failed", parseStatus: "failed" }).where(eq(documents.id, first.documentId));
      const [extra] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "xlsx",
          storageKey: "extra",
          sha256: "different",
          fileName: "boq.csv",
          status: "uploaded",
          parseStatus: "pending",
        })
        .returning();
      if (!extra) throw new Error("extra");
      const again = await ingestDocument(opened.db, {
        projectId: started.projectId,
        workspaceId: started.workspaceId,
        userId: started.userId,
        documentId: extra.id,
        fileName: "boq.csv",
        bytes,
      });
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.documentId).toBe(first.documentId);
      const rows = await opened.db.select().from(documents).where(eq(documents.projectId, started.projectId));
      const same = rows.filter((row) => row.sha256 !== "different");
      expect(same).toHaveLength(1);
      expect(rows.some((row) => row.id === extra.id)).toBe(false);
    } finally {
      await opened.close();
    }
  });

  it("blocks a file that was already read and does not keep a new row", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88012n,
        name: "Ada",
        projectName: "Read",
        role: "client",
      });
      const first = await ingestDocument(opened.db, {
        projectId: started.projectId,
        workspaceId: started.workspaceId,
        userId: started.userId,
        fileName: "boq.csv",
        bytes,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      await opened.db.update(documents).set({ status: "parsed", parseStatus: "parsed" }).where(eq(documents.id, first.documentId));
      const [placeholder] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "upload",
          storageKey: "placeholder",
          sha256: "placeholder",
          fileName: "boq.csv",
          status: "uploaded",
        })
        .returning();
      if (!placeholder) throw new Error("placeholder");
      const again = await ingestDocument(opened.db, {
        projectId: started.projectId,
        workspaceId: started.workspaceId,
        userId: started.userId,
        documentId: placeholder.id,
        fileName: "boq.csv",
        bytes,
      });
      expect(again.ok).toBe(false);
      if (again.ok) return;
      expect(again.message).toContain("You've already uploaded this file");
      const rows = await opened.db.select().from(documents).where(eq(documents.projectId, started.projectId));
      expect(rows.map((row) => row.id)).toEqual([first.documentId]);
    } finally {
      await opened.close();
    }
  });
});
