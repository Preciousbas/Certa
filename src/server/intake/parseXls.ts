import { createRequire } from "node:module";
import { BYTE } from "./detect.js";
import { chunksFromRows, rowsFromMatrix, type ParsedDocument } from "./grid.js";

export const SHEETJS_VERSION = "0.18.5";

type SheetJs = {
  read: (data: Uint8Array, opts: { type: "array"; cellFormula?: boolean }) => {
    SheetNames: string[];
    Sheets: Record<string, { "!ref"?: string } & Record<string, { v?: unknown; w?: string; f?: string } | undefined>>;
  };
  utils: { decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } } };
};

export function parseXls(bytes: Uint8Array): ParsedDocument {
  const require = createRequire(import.meta.url);
  const book = (require("xlsx") as SheetJs).read(bytes, { type: "array" });
  const names = book.SheetNames.slice(0, BYTE.sheets);
  const rows = [];
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const ref = sheet["!ref"];
    if (!ref) continue;
    const range = (require("xlsx") as SheetJs).utils.decode_range(ref);
    const matrix: string[][] = [];
    for (let r = range.s.r; r <= range.e.r && r < BYTE.rows; r += 1) {
      const values: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const address = `${String.fromCharCode(65 + c)}${r + 1}`;
        const cell = sheet[address];
        const shown = typeof cell?.v === "string" || typeof cell?.v === "number" ? String(cell.v) : "";
        values[c] = cell?.w ?? shown;
      }
      matrix[r] = values.map((value) => value ?? "");
    }
    rows.push(...rowsFromMatrix(name, matrix, new Map()));
  }
  return { kind: "xls", pageCount: null, sheetNames: names, chunks: chunksFromRows(rows, "cell"), rows };
}
