import { describe, expect, it } from "vitest";
import { countNoun } from "./count-noun.js";

describe("countNoun", () => {
  it("uses the singular for 1 and the plural for 0 and 2", () => {
    expect(countNoun(0, "thing")).toBe("0 things");
    expect(countNoun(1, "thing")).toBe("1 thing");
    expect(countNoun(2, "thing")).toBe("2 things");
    expect(countNoun(0, "red item")).toBe("0 red items");
    expect(countNoun(1, "figure")).toBe("1 figure");
    expect(countNoun(2, "hour")).toBe("2 hours");
    expect(countNoun(1, "person", "people")).toBe("1 person");
    expect(countNoun(0, "person", "people")).toBe("0 people");
  });
});
