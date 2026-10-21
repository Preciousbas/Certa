import { InvalidMoney } from "./kobo.js";

const SCALE = 1_000_000n;

export function koboToMicro(kobo: bigint, koboPerUsdc: bigint): bigint {
  if (kobo < 0n || koboPerUsdc <= 0n) throw new InvalidMoney("fx");
  return (kobo * SCALE) / koboPerUsdc;
}

export function microToKobo(micro: bigint, koboPerUsdc: bigint): bigint {
  if (micro < 0n || koboPerUsdc <= 0n) throw new InvalidMoney("fx");
  return (micro * koboPerUsdc + SCALE / 2n) / SCALE;
}

/** Largest remainder. The micros add up to converting the kobo sum. */
export function allocateMicro(kobos: bigint[], koboPerUsdc: bigint): bigint[] {
  if (koboPerUsdc <= 0n) throw new InvalidMoney("fx");
  const bases = kobos.map((kobo) => {
    if (kobo < 0n) throw new InvalidMoney("fx");
    return (kobo * SCALE) / koboPerUsdc;
  });
  const remainders = kobos.map((kobo) => (kobo * SCALE) % koboPerUsdc);
  const total = kobos.reduce((sum, kobo) => sum + kobo, 0n);
  let left = koboToMicro(total, koboPerUsdc) - bases.reduce((sum, part) => sum + part, 0n);
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  const out = [...bases];
  let cursor = 0;
  while (left > 0n) {
    const slot = order[cursor % order.length];
    if (!slot) break;
    const current = out[slot.index];
    if (current === undefined) break;
    out[slot.index] = current + 1n;
    left -= 1n;
    cursor += 1;
  }
  return out;
}
