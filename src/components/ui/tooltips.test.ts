import { describe, expect, it } from "vitest";
import { TOOLTIPS, tooltipText } from "./tooltips.js";

describe("tooltips", () => {
  it("keeps each glossary line exact", () => {
    expect(tooltipText("Locked")).toBe("The money is in the escrow and cannot be moved until this stage is approved.");
    expect(tooltipText("Retention")).toContain("usually 5%");
    expect(Object.values(TOOLTIPS).every((line) => !line.includes("\n"))).toBe(true);
  });
});
