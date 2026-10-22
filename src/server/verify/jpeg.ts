import sharp from "sharp";
import { averageHashOf, laplacianVariance, meanLuma } from "./pixels.js";

const PROBE = 64;

export type JpegFacts = {
  width: number;
  height: number;
  longSide: number;
  meanLuma: number;
  laplacian: number;
  phash: string;
};

async function gray(bytes: Uint8Array, size: number): Promise<{ data: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(Buffer.from(bytes))
    .rotate()
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Uint8Array.from(data), width: info.width, height: info.height };
}

export async function inspectJpeg(bytes: Uint8Array): Promise<JpegFacts> {
  const meta = await sharp(Buffer.from(bytes)).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const probe = await gray(bytes, PROBE);
  const hash = await gray(bytes, 8);
  return {
    width,
    height,
    longSide: Math.max(width, height),
    meanLuma: meanLuma(probe.data),
    laplacian: laplacianVariance(probe.data, probe.width, probe.height),
    phash: averageHashOf(hash.data, hash.width, hash.height),
  };
}

export const VISION_LONG_SIDE = 1024;

export async function resizeLongSide(bytes: Uint8Array, max = VISION_LONG_SIDE): Promise<Uint8Array> {
  const image = sharp(Buffer.from(bytes)).rotate();
  const meta = await image.metadata();
  const long = Math.max(meta.width ?? 0, meta.height ?? 0);
  const pipeline = long > max ? image.resize({ width: max, height: max, fit: "inside" }) : image;
  return Uint8Array.from(await pipeline.jpeg({ quality: 85 }).toBuffer());
}

export async function stampJpeg(bytes: Uint8Array, label: string): Promise<Uint8Array> {
  const safe = label.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char);
  const svg = `<svg width="1200" height="64"><rect width="100%" height="100%" fill="#1A1A1E"/><text x="16" y="42" fill="#EEEEEF" font-size="28" font-family="sans-serif">${safe}</text></svg>`;
  const stamped = await sharp(Buffer.from(bytes))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .composite([{ input: Buffer.from(svg), gravity: "southwest" }])
    .jpeg({ quality: 85 })
    .toBuffer();
  return Uint8Array.from(stamped);
}
