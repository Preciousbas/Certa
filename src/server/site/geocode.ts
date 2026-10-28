import { appBaseUrl } from "../../lib/appUrl.js";

export type GeocodeHit = { lat: number; lng: number; label: string };

/** Nominatim lookup for a Nigerian address. Never throws. Tests pass a fake fetch. */
export async function geocodeSite(text: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeHit | null> {
  const query = text.trim();
  if (!query || query === "Not set yet") return null;
  if (process.env.VITEST && fetchImpl === fetch) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ng&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": `Certa/1.0 (+${appBaseUrl() || "https://certa.app"})`, Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const hit = body[0];
    if (!hit) return null;
    const lat = +(hit.lat ?? "");
    const lng = +(hit.lon ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: (hit.display_name || query).slice(0, 240) };
  } catch {
    return null;
  }
}
