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
  const stripped = raw
    .trim()
    .replace(/\s*naira\s*$/i, "")
    .replace(/\s+/g, "")
    .replace(/₦/g, "")
    .replace(/,/g, "")
    .replace(/^(?:NGN|N)/i, "");
  if (/^\d{1,13}\.\d{2}$/.test(stripped)) return moneyKobo(stripped);
  if (/^\d{1,13}$/.test(stripped)) return BigInt(stripped) * 100n;
  return null;
}

/** A currency marker, a thousands comma, two decimals, or a trailing "naira". A bare stage number is not money. */
export function markedMoney(raw: string): bigint | null {
  const text = raw.trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, "");
  const marked = /₦/.test(text) || /NGN/i.test(text) || /^N\d/i.test(compact) || /naira\s*$/i.test(text) || /,\d{3}/.test(text) || /\.\d{2}(?:\D|$)/.test(text);
  if (!marked) return null;
  return cellMoney(text);
}

/** First money figure in a sentence, such as "Contract Sum: N10,000,000.00 (Ten Million Naira)". */
export function proseMoney(raw: string): bigint | null {
  const match = /(?:₦|\bNGN\b|\bN)?\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?(?:\s*naira)?|(?:₦|\bNGN\b|\bN)\s*\d+(?:\.\d{2})?|\d+(?:\.\d{2})\s*naira/i.exec(raw);
  if (!match) return markedMoney(raw);
  return markedMoney(match[0]) ?? cellMoney(match[0]);
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
