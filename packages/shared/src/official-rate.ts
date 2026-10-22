const SOURCE = "https://api.frankfurter.dev/v2/providers/cbn/rates?base=USD&quotes=NGN";
const DAY = 6 * 60 * 60 * 1000;

export type OfficialRate = { koboPerUsdc: bigint; asOf: string };

let cached: { at: number; rate: OfficialRate } | null = null;

export function clearCbnRateCache(): void {
  cached = null;
}

/** CBN publishes naira per US dollar to four decimals. USDC uses that dollar rate. */
export function parseCbnRate(body: string): OfficialRate | null {
  const rows = [...body.matchAll(/"date":"(\d{4}-\d{2}-\d{2})"[\s\S]*?"rate":(\d+(?:\.\d+)?)/g)];
  const last = rows.at(-1);
  if (!last) return null;
  const asOf = last[1];
  const raw = last[2];
  if (!asOf || !raw) return null;
  const parts = raw.split(".");
  const whole = parts[0];
  if (!whole || !/^\d+$/.test(whole)) return null;
  const padded = `${parts[1] ?? ""}0000`.slice(0, 4);
  const cents = padded.slice(0, 2);
  let kobo = BigInt(whole) * 100n + BigInt(cents);
  if (Number(padded[2] ?? "0") >= 5) kobo += 1n;
  if (kobo <= 0n) return null;
  return { koboPerUsdc: kobo, asOf };
}

export async function fetchCbnRate(fetcher: typeof fetch = fetch): Promise<OfficialRate | null> {
  if (cached && Date.now() - cached.at < DAY) return cached.rate;
  try {
    const response = await fetcher(SOURCE);
    if (!response.ok) return cached?.rate ?? null;
    const rate = parseCbnRate(await response.text());
    if (!rate) return cached?.rate ?? null;
    cached = { at: Date.now(), rate };
    return rate;
  } catch {
    return cached?.rate ?? null;
  }
}

export function formatOfficialRate(rate: OfficialRate): string {
  const naira = rate.koboPerUsdc / 100n;
  const rem = rate.koboPerUsdc % 100n;
  const body = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${body}.${rem.toString().padStart(2, "0")}`;
}
