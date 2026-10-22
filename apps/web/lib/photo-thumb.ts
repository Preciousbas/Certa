import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getObject } from "../../../src/server/storage";

export async function photoThumb(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    const bytes = key.startsWith("var/photos/")
      ? Uint8Array.from(await readFile(path.join(process.cwd(), "var", "photos", path.basename(key))))
      : (await getObject("photos", key))?.bytes;
    if (!bytes) return null;
    const jpeg = await sharp(Buffer.from(bytes)).rotate().resize(320, 320, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}
