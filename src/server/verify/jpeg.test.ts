import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { resizeLongSide, VISION_LONG_SIDE } from "./jpeg.js";

describe("vision resize", () => {
  it("caps the long side at 1024 and drops EXIF", async () => {
    const big = await sharp({
      create: { width: 2000, height: 800, channels: 3, background: { r: 40, g: 90, b: 140 } },
    })
      .jpeg()
      .toBuffer();
    const out = await resizeLongSide(Uint8Array.from(big));
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(VISION_LONG_SIDE).toBe(1024);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
    expect(meta.exif).toBeUndefined();
  });
});
