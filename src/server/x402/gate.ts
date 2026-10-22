import type { stages } from "@certa/db";

export const WEATHER_PRICE_MICRO = 10_000n;
export const MATERIALS_PRICE_MICRO = 20_000n;
export const DEFAULT_MAX_PER_CALL_MICRO = 50_000n;
export const POUR_WINDOW_MS = 12 * 60 * 60 * 1000;
export const AGENT_USDC_FLOOR_MICRO = 100_000n;
export const X402_NETWORK = "eip155:84532";
export const BASE_SEPOLIA_CHAIN = 84532;

const WEATHER_TAGS = new Set(["concrete_pour", "roofing"]);
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/** Missing, invalid, or equal to the client address. Weather fees must reach the Certa treasury. */
export function payToRefusal(payTo = process.env.X402_PAY_TO_ADDRESS, client = process.env.CLIENT_ADDRESS): string | null {
  const value = payTo?.trim() ?? "";
  if (!EVM_ADDRESS.test(value)) return "The payment account is not configured.";
  const clientAddress = client?.trim() ?? "";
  if (EVM_ADDRESS.test(clientAddress) && value.toLowerCase() === clientAddress.toLowerCase()) {
    return "The payment account matches the client address. Weather fees must go to the Certa treasury.";
  }
  return null;
}

export function paidAccountDenial(
  payTo = process.env.X402_PAY_TO_ADDRESS,
  client = process.env.CLIENT_ADDRESS,
): { error: string; status: 503 } | null {
  const error = payToRefusal(payTo, client);
  return error ? { error, status: 503 } : null;
}

export function configuredPayTo(
  payTo = process.env.X402_PAY_TO_ADDRESS,
  client = process.env.CLIENT_ADDRESS,
): `0x${string}` | null {
  if (payToRefusal(payTo, client)) return null;
  return valueAsAddress(payTo);
}

function valueAsAddress(payTo: string | undefined): `0x${string}` | null {
  const value = payTo?.trim() ?? "";
  return EVM_ADDRESS.test(value) ? (value as `0x${string}`) : null;
}

type StageWeather = Pick<typeof stages.$inferSelect, "tags" | "pour">;

export function stageNeedsWeather(stage: StageWeather): boolean {
  if (stage.pour) return true;
  return stage.tags.some((tag) => WEATHER_TAGS.has(tag));
}

export function prePourDedupeKey(stageId: string, now = Date.now()): string {
  const bucket = Math.floor(now / POUR_WINDOW_MS);
  return `pre_pour_check:${stageId}:${bucket}`;
}

export function lagosMonthStart(now = new Date()): Date {
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  const startUtc = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 1);
  return new Date(startUtc - 60 * 60 * 1000);
}

export function maxPerCallMicro(source = process.env.X402_MAX_PER_CALL_MICRO): bigint {
  if (source === undefined || source === "") return DEFAULT_MAX_PER_CALL_MICRO;
  if (!/^\d+$/.test(source)) return DEFAULT_MAX_PER_CALL_MICRO;
  return BigInt(source);
}

export function rainThresholdPct(source = process.env.WEATHER_RAIN_THRESHOLD_PCT): number {
  if (source === undefined || source === "") return 60;
  if (!/^\d+$/.test(source)) return 60;
  const value = parseInt(source, 10);
  if (value > 100) return 60;
  return value;
}

export function remainingAllowance(input: {
  allowanceMicro: bigint;
  spentMicro: bigint;
  gasMicro: bigint;
}): bigint {
  const used = input.spentMicro + input.gasMicro;
  return used >= input.allowanceMicro ? 0n : input.allowanceMicro - used;
}

export function canPay(input: {
  priceMicro: bigint;
  allowanceLeft: bigint;
  maxPerCall: bigint;
}): { ok: true } | { ok: false; reason: string } {
  if (input.priceMicro <= 0n) return { ok: false, reason: "that check has no price" };
  if (input.priceMicro > input.maxPerCall) {
    return { ok: false, reason: "that check costs more than the per-call limit" };
  }
  if (input.priceMicro > input.allowanceLeft) {
    return { ok: false, reason: "the monthly allowance is used up" };
  }
  return { ok: true };
}

export function priceForPurpose(purpose: string): bigint | null {
  if (purpose === "weather_check" || purpose === "weather") return WEATHER_PRICE_MICRO;
  if (purpose === "materials_price") return MATERIALS_PRICE_MICRO;
  return null;
}

/** Two decimal places. Storage stays in micro-USDC. */
export function usdcPlain(micro: bigint): string {
  const sign = micro < 0n ? "-" : "";
  const abs = micro < 0n ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n) / 10_000n;
  return `${sign}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

export function chainIdFromCaip(network: string): number | null {
  const match = /^eip155:(\d+)$/.exec(network);
  if (!match?.[1]) return null;
  const id = parseInt(match[1], 10);
  return Number.isSafeInteger(id) ? id : null;
}

export function withinPourWindow(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() < POUR_WINDOW_MS;
}

export function plainFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned || /key|secret|token|bearer|authorization|private/i.test(cleaned)) {
    return "the payment did not settle";
  }
  return cleaned.slice(0, 160);
}
