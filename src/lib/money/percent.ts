import { InvalidMoney } from "./kobo.js";

/** Round half up. `bps` is an integer such as 500 for 5%. */
export function applyBps(amount: bigint, bps: number): bigint {
  if (amount < 0n || !Number.isInteger(bps) || bps < 0 || bps > 10_000)
    throw new InvalidMoney("bps");
  const points = BigInt(bps);
  return (amount * points + 5_000n) / 10_000n;
}
