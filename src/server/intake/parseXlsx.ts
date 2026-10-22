import ExcelJS from "exceljs";
import { BYTE } from "./detect.js";
import { chunksFromRows, rowsFromMatrix, type ParsedDocument } from "./grid.js";

function cellText(cell: ExcelJS.Cell): { text: string; formula?: string } {
  const value = cell.value;
  if (value && typeof value === "object" && "formula" in value) {
    return { text: cell.text?.trim() || "", formula: String(value.formula) };
  }
  return { text: cell.text?.trim() ?? "" };
}

export async function parseXlsx(bytes: Uint8Array): Promise<ParsedDocument> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name).slice(0, BYTE.sheets);
  const rows = [];
  let count = 0;
  for (const sheet of workbook.worksheets.slice(0, BYTE.sheets)) {
    const matrix: string[][] = [];
    const formulas = new Map<string, string>();
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      count += 1;
      if (count > BYTE.rows) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const read = cellText(cell.isMerged && cell.master && cell.master.address !== cell.address ? cell.master : cell);
        values[col - 1] = read.text;
        if (read.formula) formulas.set(`${String.fromCharCode(64 + col)}${rowNumber}`, read.formula);
      });
      matrix[rowNumber - 1] = values.map((value) => value ?? "");
    });
    rows.push(...rowsFromMatrix(sheet.name, matrix, formulas));
  }
  return { kind: "xlsx", pageCount: null, sheetNames, chunks: chunksFromRows(rows, "cell"), rows };
}
