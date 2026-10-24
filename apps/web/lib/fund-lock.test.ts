import { describe, expect, it } from "vitest";
import { showFundLock } from "./fund-lock";

describe("fund lock", () => {
  it("shows no lock button when the total is 0", () => {
    expect(showFundLock(0, 0n)).toBe(false);
    expect(showFundLock(3, 0n)).toBe(false);
    expect(showFundLock(1, 17_700_000_00n)).toBe(true);
  });
});
