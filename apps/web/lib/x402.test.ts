import { describe, expect, it } from "vitest";
import { hasPayment, paymentChallenge } from "./x402.js";

describe("x402 gate", () => {
  it("answers 402 until a payment header arrives", async () => {
    const challenge = paymentChallenge("0xabc");
    expect(challenge.status).toBe(402);
    const body = (await challenge.json()) as { accepts: { amount: string }[] };
    expect(body.accepts[0]?.amount).toBe("10000");
    expect(hasPayment(new Request("http://local"), true)).toBe(false);
    expect(hasPayment(new Request("http://local", { headers: { "x-payment": "demo" } }), true)).toBe(true);
    expect(hasPayment(new Request("http://local", { headers: { "x-payment": "demo" } }), false)).toBe(false);
  });
});
