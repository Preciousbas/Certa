import { detectFile, type FailureCode } from "./detect.js";
import { parseCsvBytes, type Chunk, type ParsedDocument } from "./grid.js";
import { parseDocx } from "./parseDocx.js";
import { parsePdf } from "./parsePdf.js";
import { parseXls } from "./parseXls.js";
import { parseXlsx } from "./parseXlsx.js";

export type ParseResult = { ok: true; document: ParsedDocument } | { ok: false; failure: FailureCode };

export type Transcriber = (image: Uint8Array, page: number) => Promise<{
  lines: { line: number; text: string; confidence: number }[];
  tables: { table: number; rows: string[][] }[];
} | null>;

function imageDocument(
  page: number,
  transcript: { lines: { line: number; text: string; confidence: number }[]; tables: { table: number; rows: string[][] }[] },
): ParsedDocument {
  const chunks: Chunk[] = transcript.lines.map((line, index) => ({
    anchor: `p${page}:l${line.line}`,
    kind: "ocr_line" as const,
    content: line.text,
    ord: index,
    ocrConfidence: line.confidence,
  }));
  const rows = transcript.tables.flatMap((table) =>
    table.rows.map((cells, index) => ({
      sheet: `p${page}`,
      row: index + 1,
      cells: cells.map((text, cell) => ({ col: String.fromCharCode(65 + cell), text })),
      anchor: `p${page}:t${table.table}:r${index + 1}`,
      content: cells.join(" | "),
    })),
  );
  rows.forEach((row, index) => {
    chunks.push({ anchor: row.anchor, kind: "table_row", content: row.content, ord: chunks.length + index });
  });
  return { kind: "image", pageCount: 1, sheetNames: null, chunks, rows };
}

export async function parseBytes(name: string, bytes: Uint8Array, transcribe?: Transcriber): Promise<ParseResult> {
  const detected = await detectFile(name, bytes);
  if (!detected.ok) return detected;
  if (detected.kind === "csv") return { ok: true, document: parseCsvBytes(name, bytes) };
  if (detected.kind === "xlsx") return { ok: true, document: await parseXlsx(bytes) };
  if (detected.kind === "xls") return { ok: true, document: parseXls(bytes) };
  if (detected.kind === "docx") return { ok: true, document: await parseDocx(bytes) };
  if (detected.kind === "pdf") {
    const parsed = await parsePdf(bytes);
    if ("failure" in parsed) return { ok: false, failure: parsed.failure };
    if (parsed.kind === "pdf_scanned") {
      if (transcribe) {
        const page = await transcribe(bytes, 1);
        if (page) {
          const image = imageDocument(1, page);
          return { ok: true, document: { ...image, kind: "pdf_scanned", pageCount: parsed.pageCount } };
        }
      }
      return { ok: true, document: { kind: "pdf_scanned", pageCount: parsed.pageCount, sheetNames: null, chunks: [], rows: [], scan: true } };
    }
    return { ok: true, document: parsed };
  }
  if (!transcribe) {
    return { ok: true, document: { kind: "image", pageCount: 1, sheetNames: null, chunks: [], rows: [], scan: true } };
  }
  let image = bytes;
  if (name.toLowerCase().endsWith(".heic") || name.toLowerCase().endsWith(".heif")) {
    const convert = (await import("heic-convert")).default as unknown as (input: { buffer: Uint8Array; format: "JPEG" }) => Promise<Uint8Array>;
    image = await convert({ buffer: bytes, format: "JPEG" });
  }
  const page = await transcribe(image, 1);
  if (!page) return { ok: false, failure: "unreadable" };
  return { ok: true, document: imageDocument(1, page) };
}
