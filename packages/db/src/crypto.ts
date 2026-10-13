import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEMO_KEY_MATERIAL = "certa-demo-not-for-production";

export function encryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (raw && raw.length >= 16) return createHash("sha256").update(raw).digest();
  if (process.env.DEMO_MODE === "1" || process.env.VITEST) {
    return createHash("sha256").update(DEMO_KEY_MATERIAL).digest();
  }
  throw new Error("APP_ENCRYPTION_KEY is required");
}

export function encryptString(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptString(payload: string, key = encryptionKey()): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function chainHash(prev: string, payload: string): string {
  return sha256Hex(`${prev}\n${payload}`);
}
