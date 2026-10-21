import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { splitCsvLine, sniffDelimiter } from "../src/server/intake/interpret.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/boq");

function rowsOf(name: string): string[][] {
  const text = readFileSync(join(root, name), "utf8");
  const delimiter = sniffDelimiter(text);
  return text.split(/\r?\n/).map((line) => (line.trim() ? splitCsvLine(line, delimiter) : []));
}

async function writeXlsx(name: string, rows: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("BoQ");
  rows.forEach((row, rowIndex) => {
    row.forEach((value, column) => {
      const cell = sheet.getCell(rowIndex + 1, column + 1);
      cell.value = value;
      cell.numFmt = "@";
    });
  });
  await book.xlsx.writeFile(join(root, name));
}

async function writeTextPdf(name: string, rows: string[][]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const columns = [36, 70, 280, 340, 400, 470];
  let page = pdf.addPage([620, 880]);
  let y = 850;
  for (const row of rows) {
    if (y < 36) {
      page = pdf.addPage([620, 880]);
      y = 850;
    }
    row.forEach((cell, index) => {
      const text = cell.replace(/[^\x20-\x7E]/g, " ").slice(0, 80);
      if (!text) return;
      page.drawText(text, { x: columns[index] ?? 36, y, size: 8, font, color: rgb(0.05, 0.1, 0.16) });
    });
    y -= 12;
  }
  writeFileSync(join(root, name), await pdf.save());
}

const TINY_JPEG = Buffer.from(
  "/9j/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);

async function writeScanned(name: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage([620, 880]);
  writeFileSync(join(root, name), await pdf.save());
}

async function main() {
  const sample = rowsOf("duplex_lekki_sample.csv");
  await writeXlsx("duplex_lekki_sample.xlsx", sample);
  await writeTextPdf("duplex_lekki_sample.pdf", sample);
  await writeScanned("duplex_lekki_sample_scanned.pdf");
  writeFileSync(join(root, "duplex_lekki_sample_page2.jpg"), TINY_JPEG);
  writeFileSync(join(root, "unreadable_blurry.jpg"), TINY_JPEG);
  const milestones = [
    ["SAMPLE contract — fictitious, for Certa testing only"],
    ["Client", "Ada Client"],
    ["Contractor", "Emmy Builders Ltd"],
    ["Contract sum", "18500000.00"],
    ["Milestone", "1", "Mobilisation", "10%"],
    ["Milestone", "2", "Substructure", "20%"],
    ["Milestone", "3", "Ground floor", "20%"],
    ["Milestone", "4", "Roof", "20%"],
    ["Milestone", "5", "Finishes", "20%"],
    ["Milestone", "6", "Handover", "10%"],
    ["Note", "Retention: 5% of each interim payment."],
    ["Note", "Mobilisation advance: 15% recovered pro-rata from milestones 2-5."],
  ];
  await writeTextPdf("milestones_contract_sample.pdf", milestones);
  process.stdout.write("fixtures written\n");
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "fixture failed\n");
  process.exit(1);
});
