import { releaseSplit } from "./release-split.js";
import { bAp4 } from "../../bot/messages.js";
import { describe, expect, it } from "vitest";

describe("release split", () => {
  it("rounds retention down the way the contract does", () => {
    expect(releaseSplit({ amountUsdc: 1_000_000n, amountNgnKobo: 100_000n, retentionBps: 0 })).toMatchObject({
      payoutUsdc: 1_000_000n,
      retentionUsdc: 0n,
      payoutNgnKobo: 100_000n,
      retentionNgnKobo: 0n,
    });
    const odd = releaseSplit({ amountUsdc: 1_000_001n, amountNgnKobo: 10_001n, retentionBps: 500 });
    expect(odd.retentionUsdc).toBe((1_000_001n * 500n) / 10_000n);
    expect(odd.payoutUsdc).toBe(1_000_001n - odd.retentionUsdc);
    expect(odd.retentionNgnKobo).toBe((10_001n * 500n) / 10_000n);
  });

  it("shows the payout and the retention in the paid message", () => {
    const split = releaseSplit({ amountUsdc: 2_000_000n, amountNgnKobo: 200_000n, retentionBps: 500 });
    const text = bAp4({
      amount: "₦2,000.00",
      retention: "₦100.00",
      contractor: "Kemfor",
      n: 1,
      stage: "Substructure",
      explorerLink: "https://sepolia.etherscan.io/tx/0x" + "ab".repeat(32),
    });
    expect(text).toContain("Paid ₦2,000.00");
    expect(text).toContain("₦100.00 is kept as retention");
    expect(split.payoutNgnKobo).toBe(190_000n);
    expect(/^0x[a-fA-F0-9]{64}$/.test("0x" + "ab".repeat(32))).toBe(true);
  });
});
