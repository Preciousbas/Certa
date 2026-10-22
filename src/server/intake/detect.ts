import { badType, ENCRYPTED, unreadable } from "./messages.js";

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const BYTE = {
  pdf: UPLOAD_MAX_BYTES,
  office: UPLOAD_MAX_BYTES,
  csv: UPLOAD_MAX_BYTES,
  image: UPLOAD_MAX_BYTES,
  telegram: UPLOAD_MAX_BYTES,
  zipBytes: 100 * 1024 * 1024,
  zipEntries: 5_000,
  pages: 200,
  sheets: 20,
  rows: 20_000,
  files: 10,
} as const;

export type FileKind = "pdf" | "docx" | "xlsx" | "xls" | "csv" | "image";
export type FailureCode = "unreadable" | "encrypted" | "empty" | "too_large" | "unsupported" | "timeout";
export type Detection = { ok: true; kind: FileKind; mime: string } | { ok: false; failure: FailureCode; ext: string };
type ZipEntry = { name: string; uncompressed: number };

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (u16(bytes, offset) + u16(bytes, offset + 2) * 65536) >>> 0;
}

export function zipEntries(bytes: Uint8Array): ZipEntry[] | "bomb" | "not-zip" {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return "not-zip";
  let eocd = -1;
  const start = Math.max(0, bytes.length - (22 + 65535));
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return "not-zip";
  const count = u16(bytes, eocd + 10);
  if (count > BYTE.zipEntries) return "bomb";
  let offset = u32(bytes, eocd + 16);
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n += 1) {
    if (offset + 46 > bytes.length || bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b) return "bomb";
    const uncompressed = u32(bytes, offset + 24);
    if (uncompressed === 0xffffffff) return "bomb";
    total += uncompressed;
    if (total > BYTE.zipBytes) return "bomb";
    const nameLen = u16(bytes, offset + 28);
    const extra = u16(bytes, offset + 30);
    const comment = u16(bytes, offset + 32);
    const name = Buffer.from(bytes.subarray(offset + 46, offset + 46 + nameLen)).toString("utf8");
    entries.push({ name, uncompressed });
    offset += 46 + nameLen + extra + comment;
  }
  return entries;
}

function starts(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((value, index) => bytes[index] === value);
}

function extOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export async function detectFile(name: string, bytes: Uint8Array): Promise<Detection> {
  const ext = extOf(name);
  if (bytes.length === 0) return { ok: false, failure: "empty", ext };
  const sniffed = await import("file-type")
    .then((mod) => mod.fileTypeFromBuffer(bytes))
    .catch(() => undefined);
  if (starts(bytes, [0x25, 0x50, 0x44, 0x46])) {
    if (bytes.length > BYTE.pdf) return { ok: false, failure: "too_large", ext: ext || "pdf" };
    const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 65536))).toString("latin1");
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 65536))).toString("latin1");
    if (/\/Encrypt\b/.test(head) || /\/Encrypt\b/.test(tail)) return { ok: false, failure: "encrypted", ext: "pdf" };
    return { ok: true, kind: "pdf", mime: "application/pdf" };
  }
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (bytes.length > BYTE.office) return { ok: false, failure: "too_large", ext: "xls" };
    return { ok: true, kind: "xls", mime: "application/vnd.ms-excel" };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = zipEntries(bytes);
    if (entries === "bomb") return { ok: false, failure: "too_large", ext: ext || "zip" };
    if (entries === "not-zip") return { ok: false, failure: "unsupported", ext: ext || "zip" };
    if (entries.some((entry) => /encryptedpackage|encryptioninfo/i.test(entry.name))) return { ok: false, failure: "encrypted", ext: ext || "zip" };
    if (bytes.length > BYTE.office) return { ok: false, failure: "too_large", ext };
    if (entries.some((entry) => entry.name === "word/document.xml")) return { ok: true, kind: "docx", mime: sniffed?.mime ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    if (entries.some((entry) => entry.name === "xl/workbook.xml")) return { ok: true, kind: "xlsx", mime: sniffed?.mime ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    return { ok: false, failure: "unsupported", ext: ext || "zip" };
  }
  if (starts(bytes, [0xff, 0xd8, 0xff]) || starts(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    if (bytes.length > BYTE.image) return { ok: false, failure: "too_large", ext };
    return { ok: true, kind: "image", mime: sniffed?.mime ?? (bytes[0] === 0x89 ? "image/png" : "image/jpeg") };
  }
  const brand = Buffer.from(bytes.subarray(4, 12)).toString("ascii");
  if (brand.startsWith("ftyphei") || brand.includes("mif1") || brand.includes("heic")) {
    if (bytes.length > BYTE.image) return { ok: false, failure: "too_large", ext };
    return { ok: true, kind: "image", mime: "image/heic" };
  }
  if (ext === "csv" || ext === "txt") {
    if (bytes.length > BYTE.csv) return { ok: false, failure: "too_large", ext: "csv" };
    const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    if (!utf16 && bytes.includes(0)) return { ok: false, failure: "unsupported", ext: "csv" };
    return { ok: true, kind: "csv", mime: "text/csv" };
  }
  return { ok: false, failure: "unsupported", ext: ext || "bin" };
}

export function failureMessage(failure: FailureCode, name: string): string {
  if (failure === "encrypted") return ENCRYPTED;
  if (failure === "unsupported") return badType(name.includes(".") ? (name.split(".").pop() ?? "file") : "file");
  if (failure === "too_large") return "This file is bigger than 20 MB.";
  if (failure === "timeout") return "Reading the documents is taking longer than usual. I'll keep trying and message you within 30 minutes. Nothing has been lost.";
  return unreadable(name);
}
