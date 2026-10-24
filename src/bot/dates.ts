const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Parse "3 Nov 2026", "2026-11-03", or "03/11/2026" (day/month/year). */
export function parseStartDate(input: string): string | null {
  const text = input.trim().replace(/,/g, "");
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoDate) {
    const year = +(isoDate[1] ?? "0");
    const month = +(isoDate[2] ?? "0") - 1;
    const day = +(isoDate[3] ?? "0");
    return iso(year, month, day);
  }
  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (named) {
    const day = +(named[1] ?? "0");
    const month = MONTHS.findIndex((item) => item.toLowerCase() === (named[2] ?? "").slice(0, 3).toLowerCase());
    const year = +(named[3] ?? "0");
    return iso(year, month, day);
  }
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (numeric) {
    const day = +(numeric[1] ?? "0");
    const month = +(numeric[2] ?? "0") - 1;
    const year = +(numeric[3] ?? "0");
    return iso(year, month, day);
  }
  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Show an ISO date the way the bot asked for it, for example 9 Nov 2026. */
export function formatIsoDate(iso: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parsed) return iso;
  const month = MONTHS[Number(parsed[2]) - 1];
  if (!month) return iso;
  return `${Number(parsed[3])} ${month} ${parsed[1]}`;
}

export function formatWatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")} ${pick("month")} ${pick("year")}`;
}
