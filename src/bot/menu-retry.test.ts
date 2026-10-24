import { createMemoryDatabase, documents, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { handleIncoming } from "./engine.js";

function labels(outbound: { messages: { keyboard?: { text: string }[][] }[] }): string[] {
  return (outbound.messages[0]?.keyboard ?? []).flat().map((button) => button.text);
}

describe("menu retry", () => {
  it("puts Retry on the menu when a file failed or is still unread", async () => {
    const opened = await createMemoryDatabase();
    try {
      const started = await startOwnProject(opened.db, {
        telegramId: 88051n,
        name: "Ada",
        projectName: "Menu",
        role: "client",
      });
      const [file] = await opened.db
        .insert(documents)
        .values({
          projectId: started.projectId,
          workspaceId: started.workspaceId,
          kind: "xlsx",
          storageKey: "menu/boq",
          sha256: "menu-sha",
          fileName: "boq.xlsx",
          status: "failed",
          parseStatus: "failed",
        })
        .returning();
      if (!file) throw new Error("document");
      const from = { id: 88051, firstName: "Ada" };
      const failed = await handleIncoming(opened.db, { type: "command", command: "menu", arg: "", from });
      expect(labels(failed)).toContain("Retry");
      await opened.db.update(documents).set({ status: "uploaded", parseStatus: "pending" }).where(eq(documents.id, file.id));
      const unread = await handleIncoming(opened.db, { type: "command", command: "menu", arg: "", from });
      expect(labels(unread)).toContain("Retry");
      await opened.db.update(documents).set({ status: "parsed", parseStatus: "parsed" }).where(eq(documents.id, file.id));
      const read = await handleIncoming(opened.db, { type: "command", command: "menu", arg: "", from });
      expect(labels(read)).not.toContain("Retry");
    } finally {
      await opened.close();
    }
  });
});
