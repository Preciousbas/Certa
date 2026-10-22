import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export type PaymentCertificateInput = {
  certificateNo: string;
  project: string;
  parties: string;
  stage: string;
  gross: string;
  retention: string;
  net: string;
  cumulative: string;
  fxLine: string;
  txHash: string;
  explorerUrl: string;
  consultant: string;
  clientApproval: string;
};

function ascii(value: string): string {
  return value.replaceAll("₦", "NGN ").replaceAll("—", "-").replace(/[^\u0000-\u00ff]/g, "");
}

export async function renderPaymentCertificate(input: PaymentCertificateInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const lines = [
    ["Certificate", input.certificateNo],
    ["Project", input.project],
    ["Parties", input.parties],
    ["Stage", input.stage],
    ["Gross amount", input.gross],
    ["Retention", input.retention],
    ["Net paid", input.net],
    ["Cumulative paid", input.cumulative],
    ["Exchange rate", input.fxLine],
    ["Release transaction", input.txHash],
    ["Consultant", input.consultant],
    ["Client approval", input.clientApproval],
  ] as const;
  page.drawText("Payment certificate", { x: 48, y: 780, size: 18, font: bold, color: rgb(0.04, 0.1, 0.18) });
  let y = 740;
  for (const [label, value] of lines) {
    page.drawText(ascii(label), { x: 48, y, size: 11, font: bold, color: rgb(0.06, 0.09, 0.16) });
    page.drawText(ascii(value).slice(0, 80), { x: 200, y, size: 11, font, color: rgb(0.06, 0.09, 0.16) });
    y -= 28;
  }
  const png = await QRCode.toBuffer(input.explorerUrl, { margin: 0, width: 128 });
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 430, y: 80, width: 110, height: 110 });
  page.drawText("Proof", { x: 430, y: 64, size: 10, font, color: rgb(0.06, 0.09, 0.16) });
  return doc.save();
}
