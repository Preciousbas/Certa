import { createMemoryDatabase, memberships, projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { callbackData } from "./callbacks.js";
import { handleIncoming, type Inbound } from "./engine.js";
import type { Outbound } from "./flows/common.js";

const maker = { id: 94001, firstName: "Bruce" };

function textOf(outbound: Outbound): string {
  return outbound.messages.map((message) => message.text).join("\n");
}

describe("new project flow", () => {
  it("ends with one success message that repeats the start date, and a second tap does not error", async () => {
    const opened = await createMemoryDatabase();
    try {
      const send = (inbound: Inbound) => handleIncoming(opened.db, inbound, { now: () => new Date("2026-10-24T05:20:00Z") });
      await send({ type: "callback", data: callbackData("go", "create"), from: maker });
      await send({ type: "text", text: "Bruce QA 24 Oct", from: maker });
      await send({ type: "text", text: "Lekki", from: maker });
      await send({ type: "callback", data: callbackData("go", "skip"), from: maker });
      const dated = await send({ type: "text", text: "9 Nov 2026", from: maker });
      expect(textOf(dated)).toContain("Are you the Client or the Contractor?");
      const created = await send({ type: "callback", data: callbackData("sd", "client"), from: maker });
      const success = textOf(created);
      expect(success).toContain("Project created");
      expect(success).toContain("Bruce QA 24 Oct");
      expect(success).toContain("9 Nov 2026");
      expect(success).not.toContain("Something went wrong");
      expect(created.messages.filter((message) => message.text.includes("Project created"))).toHaveLength(1);
      const again = await send({ type: "callback", data: callbackData("sd", "client"), from: maker });
      expect(textOf(again)).toBe("");
      expect(textOf(again)).not.toContain("Something went wrong");
      const userProjects = await opened.db
        .select({ id: projects.id })
        .from(projects)
        .innerJoin(memberships, eq(memberships.projectId, projects.id));
      expect(userProjects).toHaveLength(1);
    } finally {
      await opened.close();
    }
  });
});
