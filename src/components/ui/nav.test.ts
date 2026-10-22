import { describe, expect, it } from "vitest";
import { BOTTOM_NAV, sectionHref } from "./nav.js";

describe("navigation", () => {
  it("has five equal bottom tabs", () => {
    expect(BOTTOM_NAV.map((item) => item.label)).toEqual(["Timeline", "Stages", "Fund", "Changes", "More"]);
  });

  it("keeps wallet and billing outside the project path", () => {
    expect(sectionHref("p1", "stages")).toBe("/app/p/p1/stages");
    expect(sectionHref("p1", "wallet")).toBe("/wallet");
    expect(sectionHref(null, "fund")).toBe("/fund");
  });
});
