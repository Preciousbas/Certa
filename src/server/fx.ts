import { fxRates, getDatabase } from "@certa/db";
import { desc } from "drizzle-orm";
import { parseCbnRate } from "@certa/shared";

export type ActiveRate = { koboPerUsdc: bigint; source: string; asOf: string };

export async function getActiveRate(): Promise<ActiveRate | null> {
  const db = await getDatabase();
  const row = (await db.select().from(fxRates).orderBy(desc(fxRates.createdAt)).limit(1))[0];
  if (!row) return null;
  return { koboPerUsdc: row.koboPerUsdc, source: row.source, asOf: row.asOf };
}

export async function ensureFxRate(): Promise<void> {
  const existing = await getActiveRate();
  if (existing) return;
  const source = process.env.FX_SOURCE ?? "api";
  const db = await getDatabase();
  if (source === "manual") {
    const raw = process.env.FX_MANUAL_KOBO_PER_USDC ?? "";
    const asOf = process.env.FX_MANUAL_AS_OF ?? "";
    if (!/^\d+$/.test(raw) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
    await db
      .insert(fxRates)
      .values({ koboPerUsdc: BigInt(raw), source: "manual", asOf })
      .onConflictDoNothing();
    return;
  }
  const response = await fetch(
    "https://api.frankfurter.dev/v2/providers/cbn/rates?base=USD&quotes=NGN",
  ).catch(() => null);
  if (!response?.ok) return;
  const rate = parseCbnRate(await response.text());
  if (!rate) return;
  await db
    .insert(fxRates)
    .values({ koboPerUsdc: rate.koboPerUsdc, source: "api", asOf: rate.asOf })
    .onConflictDoNothing();
}
