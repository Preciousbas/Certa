import { describe, expect, it } from "vitest";
import { parseCbnRate } from "./cbn-rate";

describe("CBN rate", () => {
  it("reads the published dollar rate as kobo per USDC", () => {
    const rate = parseCbnRate('[{"date":"2026-10-15","base":"USD","quote":"NGN","rate":1331.1139}]');
    expect(rate).toEqual({ koboPerUsdc: 133111n, asOf: "2026-10-15" });
  });

  it("uses the latest row", () => {
    const rate = parseCbnRate(
      '[{"date":"2026-10-14","base":"USD","quote":"NGN","rate":1000},{"date":"2026-10-15","base":"USD","quote":"NGN","rate":1333.2568}]',
    );
    expect(rate?.asOf).toBe("2026-10-15");
    expect(rate?.koboPerUsdc).toBe(133326n);
  });

  it("rejects a body with no rate", () => {
    expect(parseCbnRate("[]")).toBeNull();
  });
});
