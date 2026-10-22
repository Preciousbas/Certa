import { InvalidMoney } from "./kobo.js";

const SCALE = 1_000_000n;

export function parseUsdc(input: string): bigint {
  const stripped = input.trim().replace(/\s+/g, "").replace(/USDC$/i, "");
  if (!/^\d+(?:\.\d{1,6})?$/.test(stripped)) throw new InvalidMoney("usdc");
  const [whole, frac = ""] = stripped.split(".");
  if (whole === undefined) throw new InvalidMoney("usdc");
  return BigInt(whole) * SCALE + BigInt((frac + "000000").slice(0, 6));
}

export function formatUsdc(micro: bigint, options?: { dp?: 2 | 6 }): string {
  const dp = options?.dp ?? 6;
  const sign = micro < 0n ? "-" : "";
  const abs = micro < 0n ? -micro : micro;
  if (dp === 6) {
    const whole = abs / SCALE;
    const frac = (abs % SCALE).toString().padStart(6, "0");
    return `${sign}${whole.toString()}.${frac} USDC`;
  }
  const hundredths = (abs + 5_000n) / 10_000n;
  const whole = hundredths / 100n;
  const frac = (hundredths % 100n).toString().padStart(2, "0");
  return `${sign}${whole.toString()}.${frac} USDC`;
}
