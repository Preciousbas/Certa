import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char);
}

export async function stampPhoto(bytes: Uint8Array, label: string): Promise<Uint8Array> {
  const svg = `<svg width="960" height="56"><rect width="100%" height="100%" fill="#1A1A1E"/><text x="16" y="36" fill="#EEEEEF" font-size="20" font-family="sans-serif">${escapeXml(label)}</text></svg>`;
  const stamped = await sharp(Buffer.from(bytes))
    .rotate()
    .resize({ width: 1280, withoutEnlargement: true })
    .composite([{ input: Buffer.from(svg), gravity: "southwest" }])
    .jpeg({ quality: 82 })
    .toBuffer();
  return Uint8Array.from(stamped);
}

export async function saveStampedPhoto(digest: string, bytes: Uint8Array): Promise<string> {
  const dir = path.join(process.cwd(), "var", "photos");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${digest}.jpg`);
  await writeFile(file, bytes);
  return `var/photos/${digest}.jpg`;
}
