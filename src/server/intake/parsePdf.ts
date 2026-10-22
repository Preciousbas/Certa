import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { BYTE, type FailureCode } from "./detect.js";
import { type Chunk, type ParsedDocument } from "./grid.js";
import { rowFromValues, type GridRow } from "./interpret.js";

const require = createRequire(import.meta.url);

function standardFontDataUrl(): string | undefined {
  try {
    const root = dirname(require.resolve("pdfjs-dist/package.json"));
    return `${join(root, "standard_fonts")}/`;
  } catch {
    return undefined;
  }
}

type TextItem = { str?: string; transform?: number[] };
type PdfPage = { getTextContent: () => Promise<{ items: TextItem[] }> };
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage> };

export async function loadPdf(bytes: Uint8Array): Promise<PdfDocument> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (src: { data: Uint8Array; disableWorker: boolean; isEvalSupported: boolean; standardFontDataUrl?: string }) => { promise: Promise<PdfDocument> };
  };
  return pdfjs.getDocument({ data: bytes, disableWorker: true, isEvalSupported: false, standardFontDataUrl: standardFontDataUrl() }).promise;
}

function rowsOnPage(items: TextItem[], page: number): GridRow[] {
  const placed = items
    .filter((item) => (item.str ?? "").trim().length > 0 && item.transform)
    .map((item) => ({ text: (item.str ?? "").trim(), x: item.transform?.[4] ?? 0, y: item.transform?.[5] ?? 0 }));
  const groups: { y: number; items: { text: string; x: number }[] }[] = [];
  for (const item of placed.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const group = groups.find((row) => Math.abs(row.y - item.y) <= 2);
    if (group) group.items.push(item);
    else groups.push({ y: item.y, items: [item] });
  }
  return groups.map((group, index) => {
    const ordered = group.items.sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let current = "";
    let lastX = -1000;
    for (const item of ordered) {
      if (lastX >= 0 && item.x - lastX > 12) {
        cells.push(current.trim());
        current = item.text;
      } else current = current ? `${current} ${item.text}` : item.text;
      lastX = item.x;
    }
    if (current.trim()) cells.push(current.trim());
    const row = rowFromValues(`p${page}`, index + 1, cells);
    return { ...row, anchor: `p${page}:t1:r${index + 1}` };
  });
}

export async function parsePdf(bytes: Uint8Array): Promise<ParsedDocument | { failure: FailureCode }> {
  const pdf = await loadPdf(bytes);
  if (pdf.numPages > BYTE.pages) return { failure: "too_large" };
  if (pdf.numPages === 0) return { failure: "empty" };
  const chunks: Chunk[] = [];
  const rows: GridRow[] = [];
  let chars = 0;
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    const text = content.items.map((item) => item.str ?? "").join("");
    chars += text.length;
    if (text.trim()) chunks.push({ anchor: `p${page}`, kind: "text", content: text.trim().slice(0, 8000), ord: chunks.length });
    for (const row of rowsOnPage(content.items, page)) {
      rows.push(row);
      chunks.push({ anchor: row.anchor, kind: "table_row", content: row.cells.map((cell) => cell.text).join(" | "), ord: chunks.length });
    }
  }
  if (chars / pdf.numPages < 50) return { kind: "pdf_scanned", pageCount: pdf.numPages, sheetNames: null, chunks, rows: [] };
  return { kind: "pdf_text", pageCount: pdf.numPages, sheetNames: null, chunks, rows };
}
