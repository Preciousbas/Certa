import { createMemoryDatabase, startOwnProject } from "@certa/db";
import { describe, expect, it } from "vitest";
import { listMemberProjects } from "./member-projects";

describe("listMemberProjects", () => {
  it("lists every project the signed-in user belongs to", async () => {
    const opened = await createMemoryDatabase();
    try {
      const names = ["Bruce QA Test 23 Oct", "Bruce QA Test 2 24 Oct", "Bruce QA Test 3 24 Oct"];
      let userId = "";
      for (const projectName of names) {
        const started = await startOwnProject(opened.db, {
          telegramId: 88041n,
          name: "Bruce",
          projectName,
          role: "client",
        });
        userId = started.userId;
      }
      const rows = await listMemberProjects(opened.db, userId);
      expect(rows.map((row) => row.project.name).sort()).toEqual([...names].sort());
      expect(rows).toHaveLength(3);
    } finally {
      await opened.close();
    }
  });
});
