import { describe, expect, it } from "vitest";
import { allocateMicro, koboToMicro } from "./fx.js";
import { InvalidMoney, parseNaira } from "./kobo.js";
import { applyBps } from "./percent.js";
import { formatUsdc, parseUsdc } from "./usdc.js";

describe("money", () => {
  it("converts the published naira amounts into exact USDC micros", () => {
    expect(koboToMicro(266222n, 133111n)).toBe(2000000n);
    expect(koboToMicro(2662220n, 133111n)).toBe(20000000n);
  });

  it("allocates stage micros with the largest remainder", () => {
    const parts = allocateMicro(
      [
        268750000n,
        1134856000n,
        625574750n,
        1053500000n,
        666500000n,
        800875000n,
        419250000n,
        190694250n,
        365500000n,
      ],
      133111n,
    );
    expect(parts).toEqual([
      2018991669n,
      8525636499n,
      4699647287n,
      7914447341n,
      5007099338n,
      6016595172n,
      3149627003n,
      1432595728n,
      2745828669n,
    ]);
    expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(41510468706n);
  });

  it("rounds retention and VAT half up", () => {
    expect(applyBps(5525500000n, 500)).toBe(276275000n);
    expect(applyBps(5140000000n, 750)).toBe(385500000n);
  });

  it("parses naira and rejects a dotted thousands separator", () => {
    expect(parseNaira("1,350,000")).toBe(135000000n);
    expect(parseNaira("₦1,350,000.50")).toBe(135000050n);
    expect(() => parseNaira("1.350.000")).toThrow(InvalidMoney);
  });

  it("parses and prints USDC", () => {
    expect(parseUsdc("20.5")).toBe(20500000n);
    expect(formatUsdc(20500000n, { dp: 2 })).toBe("20.50 USDC");
  });
});
