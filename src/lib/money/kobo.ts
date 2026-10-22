export class InvalidMoney extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoney";
  }
}

/** Whole naira and up to two decimal kobo. No floats. */
export function parseNaira(input: string): bigint {
  const stripped = input
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(?:NGN|₦|N)/i, "");
  if (!/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(stripped)) {
    throw new InvalidMoney("naira");
  }
  const [whole, frac = ""] = stripped.replace(/,/g, "").split(".");
  if (whole === undefined || !/^\d+$/.test(whole) || frac.length > 2)
    throw new InvalidMoney("naira");
  const cents = (frac + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(cents);
}

export function formatNaira(kobo: bigint): string {
  const sign = kobo < 0n ? "-" : "";
  const abs = kobo < 0n ? -kobo : kobo;
  const whole = abs / 100n;
  const rem = abs % 100n;
  const body = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}₦${body}.${rem.toString().padStart(2, "0")}`;
}
