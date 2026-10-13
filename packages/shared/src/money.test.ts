import { describe, expect, it } from "vitest";
import {
  CERTA_FEE_BPS,
  checkPercentages,
  checkStageTotals,
  certaFee,
  formatMoneyPair,
  formatUsdc,
  fxRateFromNaira,
  nairaToKobo,
  retentionSplit,
  usdcFromNgnKobo,
} from "./money.js";
import { DEMO_CONTRACT_NAIRA, DEMO_FX_NAIRA_PER_USDC, DEMO_STAGES } from "./stages.js";

describe("money", () => {
  const rate = fxRateFromNaira(DEMO_FX_NAIRA_PER_USDC);
  const contractKobo = nairaToKobo(DEMO_CONTRACT_NAIRA);

  it("stores the Lekki contract as exact USDC base units", () => {
    expect(rate).toBe(150_000n);
    expect(contractKobo).toBe(4_500_000_000n);
    expect(usdcFromNgnKobo(contractKobo, rate)).toBe(30_000_000_000n);
  });

  it("rejects negative amounts", () => {
    expect(() => nairaToKobo(-1n)).toThrow(/negative/);
    expect(() => usdcFromNgnKobo(-1n, rate)).toThrow(/negative/);
  });

  it("splits retention without losing a unit", () => {
    const split = retentionSplit(1_000_000n, 500n);
    expect(split.payout + split.retention).toBe(1_000_000n);
    expect(split.retention).toBe(50_000n);
  });

  it("charges the 0.5% fee in integer base units", () => {
    expect(CERTA_FEE_BPS).toBe(50n);
    expect(certaFee(30_000_000_000n)).toBe(150_000_000n);
  });

  it("formats both currencies from integers", () => {
    expect(formatUsdc(30_000_000_000n)).toBe("30,000.00 USDC");
    expect(formatMoneyPair(contractKobo, rate)).toBe("₦45,000,000 (≈ 30,000.00 USDC @ ₦1,500)");
  });

  it("flags a mismatched stage total beyond 0.5%", () => {
    const result = checkStageTotals([100n, 100n], 1000n);
    expect(result.ok).toBe(false);
    expect(result.flags[0]).toMatch(/0\.5%/);
  });

  it("accepts the demo stage split", () => {
    const flags = checkPercentages(DEMO_STAGES.map((stage) => stage.bps));
    expect(flags).toEqual([]);
    const amounts = DEMO_STAGES.map((stage) => (contractKobo * BigInt(stage.bps)) / 10_000n);
    expect(checkStageTotals(amounts, contractKobo).ok).toBe(true);
  });
});
