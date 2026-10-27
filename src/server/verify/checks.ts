import { distanceMeters, type LatLng } from "@certa/shared";
import { formatSiteDistance } from "../../lib/captureMessages.js";
import {
  C5,
  C6,
  C7,
  CLOCK_AHEAD,
  NONCE_MESSAGE,
  OPEN_CAMERA_FIRST,
} from "./messages.js";

export const FRESH_MS = 10 * 60 * 1000;
export const FUTURE_MS = 2 * 60 * 1000;
export const MIN_LONG_SIDE = 1024;
export const MAX_ACCURACY_M = 50;
export const DEFAULT_SITE_RADIUS_M = 150;
export const PHASH_DUP_DISTANCE = 6;
/** Tuned on sharp synthetic frames: a flat frame is ~0, a grid is well above this. */
export const LAPLACIAN_MIN = 18;
export const MEAN_LUMA_MIN = 18;

export type PhotoCheckRecord = {
  nonce_ok: boolean;
  fresh: boolean;
  in_radius: boolean;
  exif_present: boolean;
  not_duplicate: boolean;
  image_ok: boolean;
  similar_to?: string;
  site_pin?: boolean;
  exif_distance_m?: number;
  exif_mismatch?: boolean;
};

export type CaptureCheckInput = {
  nowMs: number;
  capturedAtMs: number;
  nonceIssuedAtMs: number;
  nonceOk: boolean;
  point: LatLng;
  accuracyM: number;
  site: LatLng | null;
  radiusM: number;
  exifPoint?: LatLng | null;
  shaDuplicate: boolean;
  similarPhotoId: string | null;
  longSidePx: number;
  meanLuma: number;
  laplacian: number;
  exifPresent: boolean;
};

export type CaptureCheckResult = {
  ok: boolean;
  message: string | null;
  distanceM: number;
  checks: PhotoCheckRecord;
};

export function stageOpenForCapture(status: string, funded: boolean): boolean {
  if (status === "in_progress" || status === "ai_fail" || status === "needs_more_evidence") return true;
  return status === "not_started" && funded;
}

export function checkCapture(input: CaptureCheckInput): CaptureCheckResult {
  const radius = input.radiusM > 0 ? input.radiusM : DEFAULT_SITE_RADIUS_M;
  const hasPin = input.site !== null;
  const distance = hasPin && input.site ? Math.round(distanceMeters(input.point, input.site)) : 0;
  const accuracy = Math.round(input.accuracyM);
  const age = input.nowMs - input.capturedAtMs;
  const fresh = age <= FRESH_MS && input.capturedAtMs - input.nowMs <= FUTURE_MS && input.nonceIssuedAtMs <= input.capturedAtMs;
  const accuracyOk = Number.isFinite(input.accuracyM) && input.accuracyM <= MAX_ACCURACY_M && input.accuracyM >= 0;
  const allowance = radius + Math.min(Math.max(accuracy, 0), MAX_ACCURACY_M);
  const inRadius = hasPin && distance <= allowance;
  const duplicate = input.shaDuplicate || input.similarPhotoId !== null;
  const imageOk =
    input.longSidePx >= MIN_LONG_SIDE && input.meanLuma >= MEAN_LUMA_MIN && input.laplacian >= LAPLACIAN_MIN;
  const checks: PhotoCheckRecord = {
    nonce_ok: input.nonceOk,
    fresh,
    in_radius: hasPin ? inRadius : true,
    exif_present: input.exifPresent,
    not_duplicate: !duplicate,
    image_ok: imageOk,
    site_pin: hasPin,
  };
  if (hasPin && input.site && input.exifPoint) {
    checks.exif_distance_m = Math.round(distanceMeters(input.exifPoint, input.site));
    checks.exif_mismatch = distanceMeters(input.exifPoint, input.point) > 500;
  }
  if (input.similarPhotoId) checks.similar_to = input.similarPhotoId;

  let message: string | null = null;
  let warning = false;
  if (!input.nonceOk) message = NONCE_MESSAGE;
  else if (input.capturedAtMs - input.nowMs > FUTURE_MS) message = CLOCK_AHEAD;
  else if (age > FRESH_MS) message = C5;
  else if (input.nonceIssuedAtMs > input.capturedAtMs) message = OPEN_CAMERA_FIRST;
  else if (duplicate) message = C6;
  else if (!imageOk) message = C7;
  else if (!hasPin) {
    checks.site_pin = false;
    message = "Saved. No site pin is set for this project, so the location wasn't checked.";
    warning = true;
  } else if (!inRadius) {
    checks.in_radius = false;
    message = `Saved. This photo was taken ${formatSiteDistance(distance)} from the site pin, so the consultant will see that.`;
    warning = true;
  } else if (!accuracyOk) {
    checks.in_radius = false;
    message = `Saved. The location reading was only accurate to ${accuracy} m, so the consultant will see that.`;
    warning = true;
  }

  return { ok: message === null || warning, message, distanceM: hasPin ? distance : 0, checks };
}
