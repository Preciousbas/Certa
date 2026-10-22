import { afterEach, describe, expect, it } from "vitest";
import { billingConfig, planPriceKobo, releaseFeeKobo } from "./billing.js";

const KEYS = [
  "PLAN_MONTHLY_KOBO",
  "PLAN_YEARLY_KOBO",
  "RELEASE_FEE_BPS",
  "RELEASE_FEE_CAP_KOBO",
  "FREE_PROJECT_LIMIT_KOBO",
] as const;

const saved = new Map<string, string | undefined>();

function usePublishedPrices(): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.PLAN_MONTHLY_KOBO = "2500000";
  process.env.PLAN_YEARLY_KOBO = "25000000";
  process.env.RELEASE_FEE_BPS = "100";
  process.env.RELEASE_FEE_CAP_KOBO = "5000000";
  process.env.FREE_PROJECT_LIMIT_KOBO = "200000000";
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

const naira = (amount: bigint) => amount * 100n;

describe("release fee", () => {
  it("charges nothing while the project is inside the free limit", () => {
    usePublishedPrices();
    expect(releaseFeeKobo(naira(1_000_000n), 0n)).toBe(0n);
    expect(releaseFeeKobo(naira(2_000_000n), 0n)).toBe(0n);
  });

  it("charges 1% of only the part above the free limit", () => {
    usePublishedPrices();
    const releasedSoFar = naira(1_500_000n);
    const thisRelease = naira(1_000_000n);
    expect(releaseFeeKobo(thisRelease, releasedSoFar)).toBe(naira(5_000n));
  });

  it("charges ₦10,000 on a ₦1,000,000 release once the free limit is used", () => {
    usePublishedPrices();
    expect(releaseFeeKobo(naira(1_000_000n), naira(2_000_000n))).toBe(naira(10_000n));
  });

  it("caps a ₦10,000,000 release at ₦50,000", () => {
    usePublishedPrices();
    expect(releaseFeeKobo(naira(10_000_000n), naira(2_000_000n))).toBe(naira(50_000n));
  });

  it("reads plan prices from the same config", () => {
    usePublishedPrices();
    expect(planPriceKobo()).toEqual({ monthly: "2500000", yearly: "25000000" });
    expect(billingConfig().releaseFeeBps).toBe("100");
  });
});
