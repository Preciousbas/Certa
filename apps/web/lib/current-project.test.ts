import { describe, expect, it } from "vitest";
import { pickCurrentProject } from "./data";

const older = { id: "older", name: "Older", createdAt: new Date("2026-10-01T00:00:00Z") };
const newer = { id: "newer", name: "Newer", createdAt: new Date("2026-10-24T00:00:00Z") };

describe("pickCurrentProject", () => {
  it("opens the bot's current project and still lists every membership", () => {
    const rows = [newer, older];
    expect(pickCurrentProject(rows, "older")?.id).toBe("older");
    expect(rows.map((row) => row.id)).toEqual(["newer", "older"]);
    expect(pickCurrentProject(rows, null)?.id).toBe("newer");
    expect(pickCurrentProject(rows, "missing")?.id).toBe("newer");
  });
});
