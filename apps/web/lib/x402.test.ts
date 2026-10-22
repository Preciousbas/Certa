import { describe, expect, it } from "vitest";
import { allowanceLeft, hasPayment, paymentChallenge, rainFromOpenMeteo, settlementReceipt } from "./x402.js";

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

  it("keeps the allowance as a database remainder", () => {
    expect(allowanceLeft(2_000_000n, 10_000n)).toBe(1_990_000n);
    expect(allowanceLeft(10_000n, 10_000n)).toBe(0n);
    expect(allowanceLeft(10_000n, 20_000n)).toBe(0n);
  });

  it("reads the rain chance from Open-Meteo and ignores a settle without a transaction", () => {
    expect(rainFromOpenMeteo({ hourly: { precipitation_probability: [18, 20] } })?.summary).toBe("Rain probability 18 percent.");
    expect(rainFromOpenMeteo({ hourly: { precipitation_probability: [] } })).toBeNull();
    const hash = `0x${"ab".repeat(32)}`;
    expect(settlementReceipt({ success: true, transaction: "0x123" }, "0xabc", "Rain probability 18 percent.", "{}")).toBeNull();
    const receipt = settlementReceipt({ success: true, transaction: hash, payer: "0xpayer", amount: "10000" }, "0xpayto", "Rain probability 18 percent.", "{\"hourly\":{}}");
    expect(receipt?.costUsdc).toBe(10_000n);
    expect(receipt?.txHash).toBe(hash);
    expect(receipt?.receipt.responseHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
