/** Mirrors the escrow `_split`: retention = amount * bps / 10000, rounded down. */
export function releaseSplit(input: { amountUsdc: bigint; amountNgnKobo: bigint; retentionBps: number }): {
  payoutUsdc: bigint;
  retentionUsdc: bigint;
  payoutNgnKobo: bigint;
  retentionNgnKobo: bigint;
} {
  const bps = BigInt(Math.max(0, Math.trunc(input.retentionBps)));
  const retentionUsdc = (input.amountUsdc * bps) / 10000n;
  const retentionNgnKobo = (input.amountNgnKobo * bps) / 10000n;
  return {
    payoutUsdc: input.amountUsdc - retentionUsdc,
    retentionUsdc,
    payoutNgnKobo: input.amountNgnKobo - retentionNgnKobo,
    retentionNgnKobo,
  };
}
