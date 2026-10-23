import { formatMoneyPair, formatNgnFromKobo } from "@certa/shared";
import { formatNaira } from "../../../src/lib/money/kobo";

export function displayPair(kobo: bigint, rate: bigint): string {
  if (rate <= 0n) return formatNgnFromKobo(kobo);
  return formatMoneyPair(kobo, rate);
}

export function fxLineFor(project: {
  fxRateLocked: bigint;
  fxSource: string;
  fxLockedAt: Date | null;
  createdAt: Date;
}): string {
  if (project.fxRateLocked <= 0n) return "The contract rate is not locked yet.";
  const when = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(project.fxLockedAt ?? project.createdAt);
  return `${formatNaira(project.fxRateLocked)} per USDC · ${project.fxSource}, set ${when}`;
}
