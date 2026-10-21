import { isDemoPayment, paymentAccount, paymentChallenge } from "../../../../lib/x402";

export function GET(request: Request) {
  const payTo = paymentAccount();
  if (!payTo) return Response.json({ error: "The payment account is not configured." }, { status: 503 });
  if (isDemoPayment(request)) return Response.json({ settled: false, summary: "The demo header is not a payment." });
  const header = request.headers.get("payment-signature") ?? request.headers.get("x-payment");
  if (header && header.length > 20) return Response.json({ error: "No materials price source is configured." }, { status: 409 });
  return paymentChallenge(payTo);
}
