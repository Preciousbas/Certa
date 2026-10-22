export type ExifShot = {
  capturedAtMs: number | null;
  gps: { lat: number; lng: number } | null;
};

type Entry = { tag: number; type: number; count: number; value: number };

const empty: ExifShot = { capturedAtMs: null, gps: null };

function u16(bytes: Uint8Array, offset: number, le: boolean): number {
  if (offset + 2 > bytes.length) return 0;
  return le ? bytes[offset]! | (bytes[offset + 1]! << 8) : (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u32(bytes: Uint8Array, offset: number, le: boolean): number {
  if (offset + 4 > bytes.length) return 0;
  const read = (index: number) => bytes[offset + index] ?? 0;
  return le
    ? read(0) | (read(1) << 8) | (read(2) << 16) | (read(3) << 24)
    : (read(0) << 24) | (read(1) << 16) | (read(2) << 8) | read(3);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length && offset + i < bytes.length; i += 1) {
    const code = bytes[offset + i] ?? 0;
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

function entries(bytes: Uint8Array, offset: number, le: boolean): Entry[] {
  const count = u16(bytes, offset, le);
  const rows: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = offset + 2 + i * 12;
    rows.push({ tag: u16(bytes, at, le), type: u16(bytes, at + 2, le), count: u32(bytes, at + 4, le), value: u32(bytes, at + 8, le) });
  }
  return rows;
}

function pointer(entry: Entry): number {
  return entry.value;
}

function shortAscii(entry: Entry, le: boolean): string {
  const raw = entry.value >>> 0;
  const codes = le
    ? [raw & 255, (raw >> 8) & 255, (raw >> 16) & 255, (raw >> 24) & 255]
    : [(raw >> 24) & 255, (raw >> 16) & 255, (raw >> 8) & 255, raw & 255];
  return String.fromCharCode(...codes.slice(0, entry.count)).replace(/\0/g, "");
}

function rational(bytes: Uint8Array, offset: number, le: boolean): number {
  const num = u32(bytes, offset, le);
  const den = u32(bytes, offset + 4, le);
  return den === 0 ? 0 : num / den;
}

function parseWhen(text: string): number | null {
  const match = text.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const when = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(when.getTime()) ? null : when.getTime();
}

function parseTiff(bytes: Uint8Array, base: number): ExifShot {
  const le = bytes[base] === 0x49 && bytes[base + 1] === 0x49;
  const big = bytes[base] === 0x4d && bytes[base + 1] === 0x4d;
  if (!le && !big) return empty;
  const ifd0 = entries(bytes, base + u32(bytes, base + 4, le), le);
  const exifPointer = ifd0.find((entry) => entry.tag === 0x8769);
  const gpsPointer = ifd0.find((entry) => entry.tag === 0x8825);
  const exif = exifPointer ? entries(bytes, base + pointer(exifPointer), le) : [];
  const when = exif.find((entry) => entry.tag === 0x9003) ?? ifd0.find((entry) => entry.tag === 0x0132);
  const capturedAtMs = when ? parseWhen(ascii(bytes, when.count > 4 ? base + pointer(when) : base, 20)) : null;
  let gps: ExifShot["gps"] = null;
  if (gpsPointer) {
    const rows = entries(bytes, base + pointer(gpsPointer), le);
    const lat = rows.find((entry) => entry.tag === 0x0002);
    const latRef = rows.find((entry) => entry.tag === 0x0001);
    const lng = rows.find((entry) => entry.tag === 0x0004);
    const lngRef = rows.find((entry) => entry.tag === 0x0003);
    if (lat && lng) {
      const latAt = base + pointer(lat);
      const lngAt = base + pointer(lng);
      const latitude = rational(bytes, latAt, le) + rational(bytes, latAt + 8, le) / 60 + rational(bytes, latAt + 16, le) / 3600;
      const longitude = rational(bytes, lngAt, le) + rational(bytes, lngAt + 8, le) / 60 + rational(bytes, lngAt + 16, le) / 3600;
      const south = latRef ? (latRef.count > 4 ? ascii(bytes, base + pointer(latRef), 2) : shortAscii(latRef, le)) : "N";
      const west = lngRef ? (lngRef.count > 4 ? ascii(bytes, base + pointer(lngRef), 2) : shortAscii(lngRef, le)) : "E";
      gps = { lat: south.startsWith("S") ? -latitude : latitude, lng: west.startsWith("W") ? -longitude : longitude };
    }
  }
  return { capturedAtMs, gps };
}

export function readJpegExif(bytes: Uint8Array): ExifShot {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return empty;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break;
    const size = u16(bytes, offset + 2, false);
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if (marker === 0xe1 && ascii(bytes, offset + 4, 4) === "Exif") return parseTiff(bytes, offset + 10);
    offset += 2 + size;
  }
  return empty;
}
