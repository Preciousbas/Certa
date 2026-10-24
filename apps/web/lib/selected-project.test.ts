import { describe, expect, it } from "vitest";
import { selectedProjectId } from "./selected-project";

describe("selectedProjectId", () => {
  it("shows the project in the URL when that project is the oldest of three", () => {
    const oldest = { id: "p-23-oct", name: "Bruce QA Test 23 Oct", createdAt: new Date("2026-10-23T19:41:00Z") };
    const middle = { id: "p-24-oct-2", name: "Bruce QA Test 2 24 Oct", createdAt: new Date("2026-10-24T05:00:00Z") };
    const newest = { id: "p-24-oct-3", name: "Test 3 24 Oct", createdAt: new Date("2026-10-24T06:45:00Z") };
    const projects = [newest, middle, oldest];
    expect(selectedProjectId(projects, `/app/p/${oldest.id}/contract/review`, newest.id)).toBe(oldest.id);
  });
});
