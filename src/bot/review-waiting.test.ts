import { createMemoryDatabase, documents, jobs, startOwnProject } from "@certa/db";
import { describe, expect, it } from "vitest";
import { handleIncoming } from "./engine.js";

describe("review while a document is still being read", () => {
  it("does not say nothing is waiting while a parse job is queued", async () => {
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88002n,
        name: "Ada",
        projectName: "Bruce QA",
        role: "client",
      });
      const [file] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "xlsx",
          storageKey: "bruce/boq",
          sha256: "abc",
          fileName: "Sample BOQ.xlsx",
          status: "uploaded",
          parseStatus: "pending",
        })
        .returning();
      if (!file) throw new Error("document");
      await opened.db.insert(jobs).values({
        kind: "parse_document",
        payload: { documentId: file.id },
        dedupeKey: `parse:${file.id}`,
        status: "queued",
      });
      const outbound = await handleIncoming(opened.db, {
        type: "command",
        command: "review",
        arg: "",
        from: { id: 88002, firstName: "Ada" },
      });
      const text = outbound.messages.map((message) => message.text).join("\n");
      expect(text).toContain("I'm still reading the documents on Bruce QA.");
      expect(text).not.toContain("Nothing is waiting");
    } finally {
      await opened.close();
    }
  });
});
