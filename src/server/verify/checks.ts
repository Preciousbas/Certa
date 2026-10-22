import { distanceMeters, type LatLng } from "@certa/shared";
import {
  C5,
  C6,
  C7,
  CLOCK_AHEAD,
  NONCE_MESSAGE,
  OPEN_CAMERA_FIRST,
  outsideRadius,
  poorAccuracy,
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
};

export type CaptureCheckInput = {
  nowMs: number;
  capturedAtMs: number;
  nonceIssuedAtMs: number;
  nonceOk: boolean;
  point: LatLng;
  accuracyM: number;
  site: LatLng;
  radiusM: number;
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
  const distance = Math.round(distanceMeters(input.point, input.site));
  const accuracy = Math.round(input.accuracyM);
  const age = input.nowMs - input.capturedAtMs;
  const fresh = age <= FRESH_MS && input.capturedAtMs - input.nowMs <= FUTURE_MS && input.nonceIssuedAtMs <= input.capturedAtMs;
  const accuracyOk = Number.isFinite(input.accuracyM) && input.accuracyM <= MAX_ACCURACY_M && input.accuracyM >= 0;
  const allowance = radius + Math.min(Math.max(accuracy, 0), MAX_ACCURACY_M);
  const inRadius = accuracyOk && distance <= allowance;
  const duplicate = input.shaDuplicate || input.similarPhotoId !== null;
  const imageOk =
    input.longSidePx >= MIN_LONG_SIDE && input.meanLuma >= MEAN_LUMA_MIN && input.laplacian >= LAPLACIAN_MIN;
  const checks: PhotoCheckRecord = {
    nonce_ok: input.nonceOk,
    fresh,
    in_radius: inRadius,
    exif_present: input.exifPresent,
    not_duplicate: !duplicate,
    image_ok: imageOk,
  };
  if (input.similarPhotoId) checks.similar_to = input.similarPhotoId;

  let message: string | null = null;
  if (!input.nonceOk) message = NONCE_MESSAGE;
  else if (input.capturedAtMs - input.nowMs > FUTURE_MS) message = CLOCK_AHEAD;
  else if (age > FRESH_MS) message = C5;
  else if (input.nonceIssuedAtMs > input.capturedAtMs) message = OPEN_CAMERA_FIRST;
  else if (!accuracyOk) message = poorAccuracy(accuracy);
  else if (!inRadius) message = outsideRadius(distance, radius);
  else if (duplicate) message = C6;
  else if (!imageOk) message = C7;

  const ok = message === null;
  return { ok, message, distanceM: distance, checks };
}
