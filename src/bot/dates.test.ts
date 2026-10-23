import { describe, expect, it } from "vitest";
import { parseStartDate } from "./dates.js";

describe("start date", () => {
  it("accepts the example and an ISO date", () => {
    expect(parseStartDate("3 Nov 2026")).toBe("2026-11-03");
    expect(parseStartDate("2026-11-03")).toBe("2026-11-03");
    expect(parseStartDate("03/11/2026")).toBe("2026-11-03");
    expect(parseStartDate("whenever")).toBeNull();
  });
});