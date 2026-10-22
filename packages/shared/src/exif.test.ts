import { describe, expect, it } from "vitest";
import { readJpegExif } from "./exif.js";

function u16(value: number): number[] {
  return [value & 255, (value >> 8) & 255];
}

function u32(value: number): number[] {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}

describe("jpeg exif", () => {
  it("reads the camera capture time", () => {
    const stamp = [..."2026:10:20 12:30:00\0"].map((char) => char.charCodeAt(0));
    const tiff = [
      0x49, 0x49, 0x2a, 0x00,
      ...u32(8),
      ...u16(1),
      ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26),
      ...u32(0),
      ...u16(1),
      ...u16(0x9003), ...u16(2), ...u32(stamp.length), ...u32(44),
      ...u32(0),
      ...stamp,
    ];
    const app = [..."Exif\0\0"].map((char) => char.charCodeAt(0)).concat(tiff);
    const size = app.length + 2;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 255, size & 255, ...app, 0xff, 0xd9]);
    const shot = readJpegExif(jpeg);
    expect(shot.capturedAtMs).toBe(new Date(2026, 9, 20, 12, 30, 0).getTime());
    expect(shot.gps).toBeNull();
  });

  it("ignores a file with no exif", () => {
    expect(readJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toEqual({ capturedAtMs: null, gps: null });
  });
});