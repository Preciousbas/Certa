import { describe, expect, it } from "vitest";
import { generateJoinCode, parseStartPayload } from "./codes.js";
import { insideGeofence } from "./geo.js";
import { averageHash, evaluatePhoto, isPerceptualDuplicate } from "./photos.js";

const lekki = { lat: 6.4474, lng: 3.4723 };

describe("join codes", () => {
  it("uses an unambiguous alphabet", () => {
    const code = generateJoinCode(new Uint8Array([0, 1, 15, 18, 31, 10, 20, 7]));
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01IO]/);
    expect(parseStartPayload(`join_${code}`)).toEqual({ kind: "join", code });
  });
});

describe("photo checks", () => {
  const base = {
    nowMs: 1_700_000_000_000,
    capturedAtMs: 1_700_000_000_000,
    exifPresent: true,
    gps: lekki,
    site: lekki,
    radiusM: 150,
    nonceValid: true,
    shaDuplicate: false,
    phashDuplicate: false,
    screenshotHeuristic: false,
    compressed: false,
  };

  it("rejects an old gallery photo", () => {
    const result = evaluatePhoto({ ...base, capturedAtMs: base.nowMs - 2 * 60 * 60 * 1000 });
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/30 minutes/);
  });

  it("rejects a point outside the fence", () => {
    expect(insideGeofence({ lat: 6.5, lng: 3.5 }, lekki, 150)).toBe(false);
    const result = evaluatePhoto({ ...base, gps: { lat: 6.5, lng: 3.5 } });
    expect(result.accepted).toBe(false);
  });

  it("flags a duplicate perceptual hash", () => {
    const gray = new Uint8Array(64 * 64).fill(20);
    gray[0] = 200;
    const other = new Uint8Array(gray);
    other[10] = 21;
    const a = averageHash(gray, 64, 64);
    const b = averageHash(other, 64, 64);
    expect(isPerceptualDuplicate(a, b)).toBe(true);
    const flipped = new Uint8Array(64 * 64).fill(2);
    for (let i = 0; i < flipped.length; i += 2) flipped[i] = 250;
    expect(isPerceptualDuplicate(a, averageHash(flipped, 64, 64))).toBe(false);
  });
});
