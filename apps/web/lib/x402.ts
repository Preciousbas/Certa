import { createHash } from "node:crypto";
import { isTxHash, USDC_BASE_SEPOLIA } from "@certa/chain";
import { z } from "zod";

export const WEATHER_PRICE_USDC = 10_000n;

export function paymentChallenge(payTo: string): Response {
  return Response.json(
    {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:84532",
          amount: WEATHER_PRICE_USDC.toString(),
          asset: USDC_BASE_SEPOLIA,
          payTo,
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", version: "2" },
        },
      ],
      error: "Payment required",
    },
    { status: 402 },
  );
}

export function hasPayment(request: Request, demo: boolean): boolean {
  const header = request.headers.get("x-payment") ?? request.headers.get("payment-signature");
  if (!header) return false;
  if (demo && header === "demo") return true;
  return header.length > 20;
}

export function isDemoPayment(request: Request): boolean {
  if (process.env.DEMO_MODE === "0") return false;
  const header = request.headers.get("x-payment") ?? request.headers.get("payment-signature");
  return header === "demo";
}

export function paymentAccount(): `0x${string}` | null {
  const value = process.env.X402_PAY_TO_ADDRESS || "";
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as `0x${string}`) : null;
}

export function allowanceLeft(allowance: bigint, spent: bigint): bigint {
  return spent >= allowance ? 0n : allowance - spent;
}

const openMeteoBody = z.object({
  hourly: z.object({
    precipitation_probability: z.array(z.number()),
  }),
});

export function openMeteoUrl(lat: number, lng: number): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_hours", "6");
  url.searchParams.set("timezone", "Africa/Lagos");
  return url.toString();
}

export function rainFromOpenMeteo(body: unknown): { percent: number; summary: string } | null {
  const parsed = openMeteoBody.safeParse(body);
  const value = parsed.success
    ? parsed.data.hourly.precipitation_probability.find((item) => Number.isFinite(item))
    : undefined;
  if (value == null) return null;
  const percent = Math.round(value);
  return { percent, summary: `Rain probability ${percent} percent.` };
}

export function responseHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function settlementReceipt(
  value: { success?: boolean; transaction?: string; payer?: string; network?: string; amount?: string },
  payTo: string,
  summary: string,
  rawBody: string,
): { costUsdc: bigint; txHash: `0x${string}`; receipt: Record<string, string>; responseSummary: string } | null {
  if (!value.success || !isTxHash(value.transaction)) return null;
  const costUsdc = value.amount && /^\d+$/.test(value.amount) ? BigInt(value.amount) : WEATHER_PRICE_USDC;
  return {
    costUsdc,
    txHash: value.transaction,
    responseSummary: summary,
    receipt: {
      payer: value.payer ?? "",
      payTo,
      network: value.network ?? "eip155:84532",
      amount: costUsdc.toString(),
      responseHash: responseHash(rawBody),
    },
  };
}
