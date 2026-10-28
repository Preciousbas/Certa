export type PinnedProject = {
  siteLat: number;
  siteLng: number;
  sitePinSource?: string | null;
};

export function manualPin(latRaw: string, lngRaw: string): { lat: number; lng: number } | null {
  const latText = latRaw.trim();
  const lngText = lngRaw.trim();
  if (!latText || !lngText) return null;
  const lat = +latText;
  const lng = +lngText;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Null when nobody has set a pin. 0,0 and a missing source both mean "no pin". */
export function sitePin(project: PinnedProject): { lat: number; lng: number } | null {
  if (!project.sitePinSource) return null;
  if (project.siteLat === 0 && project.siteLng === 0) return null;
  return { lat: project.siteLat, lng: project.siteLng };
}
