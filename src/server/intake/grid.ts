import { gridFromCsv, gridFromText, rowFromValues, type GridRow } from "./interpret.js";

export type Chunk = {
  anchor: string;
  kind: "text" | "table_row" | "cell" | "ocr_line";
  content: string;
  ord: number;
  ocrConfidence?: number;
};

export type ParsedDocument = {
  kind: "pdf_text" | "pdf_scanned" | "docx" | "xlsx" | "xls" | "csv" | "image";
  pageCount: number | null;
  sheetNames: string[] | null;
  chunks: Chunk[];
  rows: GridRow[];
  scan?: boolean;
};

export function chunksFromRows(rows: GridRow[], kind: Chunk["kind"]): Chunk[] {
  return rows.filter((row) => row.content.length > 0).map((row, index) => ({ anchor: row.anchor, kind, content: row.content, ord: index }));
}

export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return Buffer.from(bytes).toString("utf16le").replace(/^\uFEFF/, "");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length - 2);
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1] ?? 0;
      swapped[i - 1] = bytes[i] ?? 0;
    }
    return swapped.toString("utf16le");
  }
  return Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "");
}

export function parseCsvBytes(name: string, bytes: Uint8Array): ParsedDocument {
  const text = decodeCsv(bytes);
  const rows = name.toLowerCase().endsWith(".txt") ? gridFromText(text, name) : gridFromCsv(text, name);
  return { kind: "csv", pageCount: null, sheetNames: [name], chunks: chunksFromRows(rows, "cell"), rows };
}

export function rowsFromMatrix(sheet: string, matrix: string[][], formulas: Map<string, string>): GridRow[] {
  return matrix.map((values, index) => {
    const shown = values.map((value, column) => {
      const letter = column < 26 ? String.fromCharCode(65 + column) : `C${column}`;
      const formula = formulas.get(`${letter}${index + 1}`);
      return formula && value ? `${value} (=${formula})` : value;
    });
    return rowFromValues(sheet, index + 1, shown);
  });
}
