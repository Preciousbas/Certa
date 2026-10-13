export const KOBO_PER_NAIRA = 100n;
export const USDC_BASE = 1_000_000n;
export const CERTA_FEE_BPS = 50n;
export const TOTAL_TOLERANCE_BPS = 50n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) throw new MoneyError(`${label} cannot be negative`);
}

/** Whole naira as an integer, stored as kobo. */
export function nairaToKobo(naira: bigint): bigint {
  assertNonNegative(naira, "naira");
  return naira * KOBO_PER_NAIRA;
}

/** ₦1,500 per USDC is stored as 150000 kobo per USDC. */
export function fxRateFromNaira(nairaPerUsdc: bigint): bigint {
  if (nairaPerUsdc <= 0n) throw new MoneyError("fx rate must be positive");
  return nairaPerUsdc * KOBO_PER_NAIRA;
}

/**
 * Convert kobo to USDC base units (6 decimals). Truncates the remainder.
 * Display code may round; this function never does.
 */
export function usdcFromNgnKobo(kobo: bigint, fxRateNgnPerUsdcKobo: bigint): bigint {
  assertNonNegative(kobo, "kobo");
  if (fxRateNgnPerUsdcKobo <= 0n) throw new MoneyError("fx rate must be positive");
  return (kobo * USDC_BASE) / fxRateNgnPerUsdcKobo;
}

export function koboFromUsdc(units: bigint, fxRateNgnPerUsdcKobo: bigint): bigint {
  assertNonNegative(units, "usdc");
  if (fxRateNgnPerUsdcKobo <= 0n) throw new MoneyError("fx rate must be positive");
  return (units * fxRateNgnPerUsdcKobo) / USDC_BASE;
}

export function applyBps(amount: bigint, bps: bigint): bigint {
  assertNonNegative(amount, "amount");
  if (bps < 0n || bps > 10_000n) throw new MoneyError("bps out of range");
  return (amount * bps) / 10_000n;
}

export function retentionSplit(amount: bigint, retentionBps: bigint): { payout: bigint; retention: bigint } {
  const retention = applyBps(amount, retentionBps);
  return { payout: amount - retention, retention };
}

export function certaFee(releasedUsdc: bigint): bigint {
  return applyBps(releasedUsdc, CERTA_FEE_BPS);
}

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatNgnFromKobo(kobo: bigint): string {
  const sign = kobo < 0n ? "-" : "";
  const abs = kobo < 0n ? -kobo : kobo;
  const naira = abs / KOBO_PER_NAIRA;
  const rem = abs % KOBO_PER_NAIRA;
  const body = group(naira.toString());
  if (rem === 0n) return `${sign}₦${body}`;
  return `${sign}₦${body}.${rem.toString().padStart(2, "0")}`;
}

/** Half-up to 2 decimal places for display. Storage stays at 6 decimals. */
export function formatUsdc(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const hundredths = (abs + 5_000n) / 10_000n;
  const whole = hundredths / 100n;
  const frac = hundredths % 100n;
  return `${sign}${group(whole.toString())}.${frac.toString().padStart(2, "0")} USDC`;
}

export function formatRate(fxRateNgnPerUsdcKobo: bigint): string {
  const naira = fxRateNgnPerUsdcKobo / KOBO_PER_NAIRA;
  const rem = fxRateNgnPerUsdcKobo % KOBO_PER_NAIRA;
  if (rem === 0n) return `₦${group(naira.toString())}`;
  return `₦${group(naira.toString())}.${rem.toString().padStart(2, "0")}`;
}

export function formatMoneyPair(kobo: bigint, fxRateNgnPerUsdcKobo: bigint): string {
  const usdc = usdcFromNgnKobo(kobo, fxRateNgnPerUsdcKobo);
  return `${formatNgnFromKobo(kobo)} (≈ ${formatUsdc(usdc)} @ ${formatRate(fxRateNgnPerUsdcKobo)})`;
}

export type TotalCheck = {
  ok: boolean;
  sum: bigint;
  driftBps: bigint;
  flags: string[];
};

export function checkStageTotals(amounts: bigint[], contractSum: bigint): TotalCheck {
  const flags: string[] = [];
  if (contractSum <= 0n) flags.push("Contract sum must be positive.");
  let sum = 0n;
  for (const amount of amounts) {
    if (amount < 0n) flags.push("A stage amount is negative.");
    else sum += amount;
  }
  let driftBps = 0n;
  if (contractSum > 0n) {
    const diff = sum > contractSum ? sum - contractSum : contractSum - sum;
    driftBps = (diff * 10_000n) / contractSum;
    if (driftBps > TOTAL_TOLERANCE_BPS) {
      flags.push("Stage totals differ from the contract sum by more than 0.5%.");
    }
  }
  return { ok: flags.length === 0, sum, driftBps, flags };
}

export function checkPercentages(bps: number[]): string[] {
  const flags: string[] = [];
  let sum = 0;
  for (const value of bps) {
    if (!Number.isInteger(value) || value < 0) flags.push("A stage percentage is negative or not a whole number.");
    else sum += value;
  }
  if (sum !== 10_000) flags.push("Stage percentages must add up to 100.");
  return flags;
}
