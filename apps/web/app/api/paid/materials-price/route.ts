import { isDemoPayment, paymentAccount, paymentChallenge } from "../../../../lib/x402";
import { apiError, emptyQuery, queryOf } from "../../../../lib/schemas";

function requirePaidAccess(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  const payTo = paymentAccount();
  if (!payTo) return apiError(503, "The payment account is not configured.", "unconfigured");
  if (isDemoPayment(request)) return Response.json({ settled: false, summary: "The demo header is not a payment." });
  const header = request.headers.get("payment-signature") ?? request.headers.get("x-payment");
  if (header && header.length > 20) return apiError(409, "No materials price source is configured.");
  return paymentChallenge(payTo);
}

export function GET(request: Request) {
  return requirePaidAccess(request);
}
