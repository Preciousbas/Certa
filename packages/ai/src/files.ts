import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export async function textFromUpload(filename: string, bytes: Uint8Array): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return new TextDecoder().decode(bytes);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const book = XLSX.read(bytes, { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0] ?? ""];
    if (!sheet) return "";
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 });
    return rows.map((row) => row.map((cell) => String(cell ?? "")).join(" | ")).join("\n");
  }
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value;
  }
  if (lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }
  throw new Error(`Unsupported file: ${filename}`);
}

export async function buildDocx(text: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const paragraphs = text.split("\n").map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildXlsx(text: string): Uint8Array {
  const rows = text.split("\n").filter(Boolean).map((line) => line.split("|").map((cell) => cell.trim()));
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(book, sheet, "Stages");
  const out = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(out);
}
