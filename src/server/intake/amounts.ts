export function digits(raw: string): number {
  let value = 0;
  let seen = false;
  for (const char of raw) {
    if (char < "0" || char > "9") break;
    seen = true;
    value = value * 10 + (char.charCodeAt(0) - 48);
  }
  return seen ? value : 0;
}

export function moneyKobo(raw: string): bigint | null {
  const match = /^(\d{1,13})\.(\d{2})$/.exec(raw.trim());
  if (!match?.[1] || !match[2]) return null;
  return BigInt(match[1]) * 100n + BigInt(match[2]);
}

export function cellMoney(raw: string): bigint | null {
  const stripped = raw.trim().replace(/\s+/g, "").replace(/₦/g, "").replace(/,/g, "").replace(/^NGN/i, "");
  if (/^\d{1,13}\.\d{2}$/.test(stripped)) return moneyKobo(stripped);
  if (/^\d{1,13}$/.test(stripped)) return BigInt(stripped) * 100n;
  return null;
}

export function quantityMilli(raw: string): bigint | null {
  const stripped = raw.trim().replace(/,/g, "").replace(/\s+/g, "");
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(stripped);
  if (!match?.[1]) return null;
  const frac = (match[2] ?? "").padEnd(3, "0");
  return BigInt(match[1]) * 1000n + BigInt(frac);
}

export function formatQty(milli: bigint): string {
  const whole = milli / 1000n;
  const frac = (milli % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
}

export function moneyString(kobo: bigint): string {
  const whole = kobo / 100n;
  const rem = (kobo % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${rem}`;
}

export function bpsFromPct(pct: string): number | null {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(pct.trim());
  if (!match?.[1]) return null;
  const frac = (match[2] ?? "").padEnd(2, "0");
  const bps = digits(match[1]) * 100 + digits(frac);
  if (!Number.isFinite(bps) || bps > 10_000) return null;
  return bps;
}

export function pctFromBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = Math.abs(bps % 100);
  if (frac === 0) return String(whole);
  return `${String(whole)}.${frac.toString().padStart(2, "0").replace(/0$/, "")}`;
}

export function mulDivRound(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  return (amount * numerator + denominator / 2n) / denominator;
}

export function grossUp(net: bigint, vatBps: number): bigint {
  return mulDivRound(net, 10_000n + BigInt(vatBps), 10_000n);
}

export function itemAmount(quantityMilliValue: bigint, rateKobo: bigint): bigint {
  return (quantityMilliValue * rateKobo + 500n) / 1000n;
}

export function absDiff(left: bigint, right: bigint): bigint {
  return left > right ? left - right : right - left;
}
