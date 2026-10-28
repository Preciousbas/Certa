import { formatSiteDistance } from "../../lib/captureMessages.js";

type Shot = {
  distanceFromSiteM: number | null;
  checks?: { site_pin?: boolean; in_radius?: boolean } | null;
};

/** One line for a stage's photos. Warns, never a pass or fail. */
export function stageLocationNote(photos: readonly Shot[]): string {
  if (photos.length === 0) return "";
  const unchecked = photos.every((photo) => photo.checks?.site_pin === false || photo.distanceFromSiteM === null);
  if (unchecked) return "📍 No site pin, location not checked";
  const far = photos.filter((photo) => photo.checks?.in_radius === false);
  if (far.length === 0) {
    const nearest = Math.max(...photos.map((photo) => photo.distanceFromSiteM ?? 0));
    return `📍 All photos within ${formatSiteDistance(nearest)} of the site pin`;
  }
  const worst = Math.max(...far.map((photo) => photo.distanceFromSiteM ?? 0));
  return `📍 ${far.length} of ${photos.length} photos taken ${formatSiteDistance(worst)} from the site pin`;
}
