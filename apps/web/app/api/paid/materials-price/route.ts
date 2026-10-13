import { hasPayment, paymentChallenge } from "../../../../lib/x402";

export async function GET(request: Request) {
  const payTo = process.env.X402_PAY_TO_ADDRESS ?? "0x0000000000000000000000000000000000000001";
  if (!hasPayment(request, process.env.DEMO_MODE !== "0")) return paymentChallenge(payTo);
  return Response.json({
    cementNgnPerBag: 9500,
    rebar12mmNgn: 7200,
    summary: "Cement ₦9,500 a bag. 12mm rebar ₦7,200.",
    paid: "$0.01",
  });
}
