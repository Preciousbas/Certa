import { createMemoryDatabase, documents, jobs, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { callbackData } from "./callbacks.js";
import { handleIncoming } from "./engine.js";

describe("retry double tap", () => {
  it("does not enqueue a second parse while the first is queued", async () => {
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88021n,
        name: "Ada",
        projectName: "Retry",
        role: "client",
      });
      const [file] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "xlsx",
          storageKey: "retry/boq",
          sha256: "retry-sha",
          fileName: "boq.xlsx",
          status: "failed",
          parseStatus: "failed",
        })
        .returning();
      if (!file) throw new Error("document");
      const from = { id: 88021, firstName: "Ada" };
      const first = await handleIncoming(opened.db, { type: "callback", data: callbackData("rx"), from });
      expect(first.messages[0]?.text).toContain("Reading your documents");
      const second = await handleIncoming(opened.db, { type: "callback", data: callbackData("rx"), from });
      expect(second.messages.map((message) => message.text).join("\n")).toBe("Already reading");
      const queued = await opened.db.select().from(jobs).where(eq(jobs.dedupeKey, `parse:${file.id}`));
      expect(queued).toHaveLength(1);
      expect(queued[0]?.status).toBe("queued");
    } finally {
      await opened.close();
    }
  });

  it("allows another Retry after the read finishes or fails", async () => {
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88022n,
        name: "Ada",
        projectName: "Retry again",
        role: "client",
      });
      const [file] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "xlsx",
          storageKey: "retry/again",
          sha256: "retry-sha-2",
          fileName: "boq.xlsx",
          status: "uploaded",
          parseStatus: "pending",
        })
        .returning();
      if (!file) throw new Error("document");
      const [job] = await opened.db
        .insert(jobs)
        .values({ kind: "parse_document", dedupeKey: `parse:${file.id}`, status: "running", payload: { documentId: file.id } })
        .returning();
      if (!job) throw new Error("job");
      const from = { id: 88022, firstName: "Ada" };
      await opened.db.update(documents).set({ status: "parsed", parseStatus: "parsed" }).where(eq(documents.id, file.id));
      await opened.db.update(jobs).set({ status: "running" }).where(eq(jobs.id, job.id));
      const finished = await handleIncoming(opened.db, { type: "callback", data: callbackData("rx"), from });
      expect(finished.messages.map((message) => message.text).join("\n")).not.toBe("Already reading");
      expect(finished.messages[0]?.text).toContain("Reading your documents");

      await opened.db.update(documents).set({ status: "failed", parseStatus: "failed" }).where(eq(documents.id, file.id));
      await opened.db.update(jobs).set({ status: "running" }).where(eq(jobs.id, job.id));
      const failed = await handleIncoming(opened.db, { type: "callback", data: callbackData("rx"), from });
      expect(failed.messages.map((message) => message.text).join("\n")).not.toBe("Already reading");
      const requeued = (await opened.db.select().from(jobs).where(eq(jobs.dedupeKey, `parse:${file.id}`)))[0];
      expect(requeued?.status).toBe("queued");
    } finally {
      await opened.close();
    }
  });
});
