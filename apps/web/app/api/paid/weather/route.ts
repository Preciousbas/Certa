import { hasPayment, paymentChallenge } from "../../../../lib/x402";

export async function GET(request: Request) {
  const payTo = process.env.X402_PAY_TO_ADDRESS ?? "0x0000000000000000000000000000000000000001";
  if (!hasPayment(request, process.env.DEMO_MODE !== "0")) return paymentChallenge(payTo);
  return Response.json({
    site: "Lekki Phase 1",
    rainProbability: 0.18,
    summary: "Low chance of rain. The pour window is open.",
    paid: "$0.01",
  });
}
