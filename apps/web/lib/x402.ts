import { USDC_BASE_SEPOLIA } from "@certa/chain";

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
