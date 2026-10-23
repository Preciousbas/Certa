import { describe, expect, it } from "vitest";
import { displayPair, fxLineFor } from "./money-display.js";

describe("zero contract rate", () => {
  it("does not throw when the locked rate is zero", () => {
    expect(displayPair(1_770_000_000n, 0n)).toBe("₦17,700,000");
    expect(
      fxLineFor({
        fxRateLocked: 0n,
        fxSource: "unset",
        fxLockedAt: null,
        createdAt: new Date("2026-10-23T00:00:00Z"),
      }),
    ).toBe("The contract rate is not locked yet.");
  });
});
