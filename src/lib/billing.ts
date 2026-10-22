/** Display prices. Not used to charge a card or to move escrow funds. */
const DEFAULT_MONTHLY_KOBO = "2500000";
const DEFAULT_YEARLY_KOBO = "25000000";
const DEFAULT_RELEASE_FEE_BPS = "100";
const DEFAULT_RELEASE_FEE_CAP_KOBO = "5000000";
const DEFAULT_FREE_PROJECT_LIMIT_KOBO = "200000000";

function digits(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && /^\d+$/.test(value)) return value;
  return fallback;
}

export type BillingConfig = {
  monthlyKobo: string;
  yearlyKobo: string;
  releaseFeeBps: string;
  releaseFeeCapKobo: string;
  freeProjectLimitKobo: string;
};

export function billingConfig(): BillingConfig {
  return {
    monthlyKobo: digits("PLAN_MONTHLY_KOBO", DEFAULT_MONTHLY_KOBO),
    yearlyKobo: digits("PLAN_YEARLY_KOBO", DEFAULT_YEARLY_KOBO),
    releaseFeeBps: digits("RELEASE_FEE_BPS", DEFAULT_RELEASE_FEE_BPS),
    releaseFeeCapKobo: digits("RELEASE_FEE_CAP_KOBO", DEFAULT_RELEASE_FEE_CAP_KOBO),
    freeProjectLimitKobo: digits("FREE_PROJECT_LIMIT_KOBO", DEFAULT_FREE_PROJECT_LIMIT_KOBO),
  };
}

export function planPriceKobo(): { monthly: string; yearly: string } {
  const config = billingConfig();
  return { monthly: config.monthlyKobo, yearly: config.yearlyKobo };
}

/**
 * Fee for one release, in kobo. Zero on the portion still inside the free limit.
 * The amount above the limit is charged at the configured bps, then capped.
 * Not called from any payment or escrow path.
 */
export function releaseFeeKobo(amountKobo: bigint, releasedSoFarKobo: bigint): bigint {
  if (amountKobo < 0n || releasedSoFarKobo < 0n) throw new Error("kobo amounts cannot be negative");
  const config = billingConfig();
  const limit = BigInt(config.freeProjectLimitKobo);
  const bps = BigInt(config.releaseFeeBps);
  const cap = BigInt(config.releaseFeeCapKobo);
  const room = limit > releasedSoFarKobo ? limit - releasedSoFarKobo : 0n;
  const chargeable = amountKobo > room ? amountKobo - room : 0n;
  const raw = (chargeable * bps) / 10_000n;
  return raw > cap ? cap : raw;
}
