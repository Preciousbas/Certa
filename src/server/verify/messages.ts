export { C1, C2, C5, C6, C7, C8, C9, outsideRadius, poorAccuracy } from "../../lib/captureMessages.js";

export const NONCE_MESSAGE = "The capture session expired. Open the camera again.";
export const CLOCK_AHEAD = "This photo's time is ahead of the server. Check the phone clock and take it again.";
export const OPEN_CAMERA_FIRST = "Take the photo after you open the camera.";
export const STAGE_NOT_OPEN = "This stage is not open for photos.";
export const CHECK_UNAVAILABLE = "automatic check unavailable";

export function formatWat(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("day")} ${read("month")} ${read("year")}, ${read("hour")}:${read("minute")} WAT`;
}

export function bullets(lines: readonly string[]): string {
  if (lines.length === 0) return "None listed.";
  return lines.map((line) => `• ${line}`).join("\n");
}
