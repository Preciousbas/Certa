import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function ascii(value: string): string {
  return value.replaceAll("₦", "NGN ").replace(/[^\u0000-\u00ff]/g, "");
}

export async function renderReportPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("Site report", { x: 48, y: 780, size: 18, font: bold, color: rgb(0.04, 0.1, 0.18) });
  let y = 740;
  for (const line of lines) {
    page.drawText(ascii(line).slice(0, 90), { x: 48, y, size: 11, font, color: rgb(0.06, 0.09, 0.16) });
    y -= 22;
    if (y < 48) break;
  }
  return doc.save();
}
