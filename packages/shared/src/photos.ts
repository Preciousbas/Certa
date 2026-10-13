import { insideGeofence, type LatLng } from "./geo.js";

export type PhotoCheckInput = {
  nowMs: number;
  capturedAtMs: number | null;
  exifPresent: boolean;
  gps: LatLng | null;
  site: LatLng;
  radiusM: number;
  nonceValid: boolean;
  shaDuplicate: boolean;
  phashDuplicate: boolean;
  screenshotHeuristic: boolean;
  compressed: boolean;
};

export type PhotoChecks = {
  accepted: boolean;
  trust: "high" | "low" | "rejected";
  reasons: string[];
};

const THIRTY_MIN = 30 * 60 * 1000;

export function evaluatePhoto(input: PhotoCheckInput): PhotoChecks {
  const reasons: string[] = [];
  if (!input.exifPresent || input.capturedAtMs === null) {
    reasons.push("This photo has no original capture time. Send it as a file, or take it in the camera page.");
  } else if (Math.abs(input.nowMs - input.capturedAtMs) > THIRTY_MIN) {
    reasons.push("The capture time is more than 30 minutes off. Take a new photo on site.");
  }
  if (!input.gps) {
    reasons.push("This photo has no GPS point inside the site fence.");
  } else if (!insideGeofence(input.gps, input.site, input.radiusM)) {
    reasons.push("The GPS point is outside the site fence.");
  }
  if (!input.nonceValid) reasons.push("The capture session expired. Open the camera again.");
  if (input.shaDuplicate || input.phashDuplicate) reasons.push("This photo was already used.");
  if (input.screenshotHeuristic) reasons.push("This looks like a screenshot or a photo of a screen.");
  if (input.compressed) reasons.push("Telegram compressed this photo, so the original data was stripped.");

  const hardFail = reasons.some((reason) => !reason.startsWith("Telegram compressed"));
  if (hardFail) return { accepted: false, trust: "rejected", reasons };
  if (input.compressed) return { accepted: true, trust: "low", reasons };
  return { accepted: true, trust: "high", reasons };
}

/** Average hash over a grayscale buffer of length width*height. Returns 16 hex chars. */
export function averageHash(gray: Uint8Array, width: number, height: number): string {
  const size = 8;
  const values: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * width) / size);
      const sy = Math.floor((y * height) / size);
      values.push(gray[sy * width + sx] ?? 0);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let bits = 0n;
  for (let i = 0; i < values.length; i++) {
    if ((values[i] ?? 0) >= mean) bits |= 1n << BigInt(i);
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingHex(a: string, b: string): number {
  const left = BigInt(`0x${a}`);
  const right = BigInt(`0x${b}`);
  let x = left ^ right;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export function isPerceptualDuplicate(a: string, b: string, maxDistance = 5): boolean {
  return hammingHex(a, b) <= maxDistance;
}
