import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

export type LetterBlock = { heading?: string; lines: string[] };

export async function blankLetterhead(kind: "rule" | "band"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  if (kind === "band") {
    page.drawRectangle({ x: 0, y: 790, width: 595, height: 52, color: rgb(0.18, 0.16, 0.13) });
    page.drawText("BASSEY ENGINEERING CONSULT", { x: 36, y: 810, size: 12, font, color: rgb(0.95, 0.93, 0.88) });
  } else {
    page.drawRectangle({ x: 28, y: 48, width: 4, height: 760, color: rgb(0.76, 0.42, 0.29) });
    page.drawText("ZANZIBAR ESTATES", { x: 44, y: 800, size: 12, font, color: rgb(0.2, 0.16, 0.12) });
  }
  page.drawText("Lagos", { x: 36, y: 36, size: 9, font, color: rgb(0.4, 0.35, 0.3) });
  return doc.save();
}

export async function renderOnLetterhead(input: {
  template: Uint8Array;
  marginTop: number;
  marginBottom: number;
  title: string;
  blocks: LetterBlock[];
  qrUrl?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.template);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const first = doc.getPage(0);
  if (!first) throw new Error("letterhead has no page");
  let page = first;
  let cursor = page.getHeight() - input.marginTop;
  const write = (text: string, size: number, face: PDFFont) => {
    const safe = text.replaceAll("₦", "NGN ").replaceAll("—", "-").replace(/[^\u0000-\u00ff]/g, "");
    if (cursor < input.marginBottom + 24) {
      page = doc.addPage([595.28, 841.89]);
      copyLetterheadChrome(first, page);
      cursor = page.getHeight() - input.marginTop;
    }
    page.drawText(safe.slice(0, 90), { x: 48, y: cursor, size, font: face, color: rgb(0.12, 0.1, 0.08) });
    cursor -= size + 6;
  };
  write(input.title, 16, bold);
  for (const block of input.blocks) {
    if (block.heading) write(block.heading, 12, bold);
    for (const line of block.lines) write(line, 10, font);
    cursor -= 6;
  }
  if (input.qrUrl) {
    const png = await QRCode.toBuffer(input.qrUrl, { margin: 0, width: 96 });
    const image = await doc.embedPng(png);
    page.drawImage(image, { x: 460, y: input.marginBottom, width: 72, height: 72 });
  }
  return doc.save();
}

function copyLetterheadChrome(from: PDFPage, to: PDFPage) {
  to.drawRectangle({ x: 0, y: 790, width: 595, height: 8, color: rgb(0.18, 0.16, 0.13) });
  void from;
}

export function changeLogLines(rows: { type: string; status: string; reason: string; responseHours: number | null }[]): string[] {
  return rows.map((row) => `${row.type} · ${row.status} · ${row.reason || "no reason"} · ${row.responseHours === null ? "waiting" : `${row.responseHours}h`}`);
}
