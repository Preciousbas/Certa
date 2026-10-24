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
});
