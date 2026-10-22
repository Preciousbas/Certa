import { describe, expect, it } from "vitest";
import { checkCapture } from "./checks.js";
import { C5, C6, C7, outsideRadius, poorAccuracy } from "./messages.js";

const now = Date.parse("2026-10-21T12:00:00Z");
const site = { lat: 6.4474, lng: 3.4723 };

function base(overrides: Partial<Parameters<typeof checkCapture>[0]> = {}) {
  return checkCapture({
    nowMs: now,
    capturedAtMs: now - 60_000,
    nonceIssuedAtMs: now - 120_000,
    nonceOk: true,
    point: site,
    accuracyM: 8,
    site,
    radiusM: 150,
    shaDuplicate: false,
    similarPhotoId: null,
    longSidePx: 1600,
    meanLuma: 80,
    laplacian: 40,
    exifPresent: false,
    ...overrides,
  });
}

describe("capture checks", () => {
  it("keeps a fresh on-site photo and records that exif is missing", () => {
    const result = base();
    expect(result.ok).toBe(true);
    expect(result.checks.exif_present).toBe(false);
    expect(result.checks.nonce_ok).toBe(true);
  });

  it("rejects a stale photo with C-5", () => {
    const result = base({ capturedAtMs: now - 11 * 60 * 1000 });
    expect(result.message).toBe(C5);
  });

  it("rejects a point outside the site radius with C-3", () => {
    const result = base({ point: { lat: 9.06, lng: 7.49 } });
    expect(result.ok).toBe(false);
    expect(result.message).toBe(outsideRadius(result.distanceM, 150));
  });

  it("rejects poor accuracy with C-4", () => {
    expect(base({ accuracyM: 80 }).message).toBe(poorAccuracy(80));
  });

  it("rejects a reused hash or a close perceptual hash with C-6", () => {
    expect(base({ shaDuplicate: true }).message).toBe(C6);
    expect(base({ similarPhotoId: "photo-1" }).message).toBe(C6);
    expect(base({ similarPhotoId: "photo-1" }).checks.similar_to).toBe("photo-1");
  });

  it("rejects a dark or tiny frame with C-7", () => {
    expect(base({ meanLuma: 4 }).message).toBe(C7);
    expect(base({ laplacian: 2 }).message).toBe(C7);
    expect(base({ longSidePx: 800 }).message).toBe(C7);
  });
});
