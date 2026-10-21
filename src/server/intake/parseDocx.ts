import mammoth from "mammoth";
import { rowFromValues, type GridRow } from "./interpret.js";
import { chunksFromRows, type Chunk, type ParsedDocument } from "./grid.js";

function tableChunks(html: string): { chunks: Chunk[]; rows: GridRow[] } {
  const chunks: Chunk[] = [];
  const rows: GridRow[] = [];
  let para = 0;
  const blocks = html.split(/<\/p>/i);
  for (const block of blocks) {
    const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || /<table/i.test(block)) continue;
    para += 1;
    chunks.push({ anchor: `para${para}`, kind: "text", content: text, ord: chunks.length });
  }
  const tables = html.split(/<table/i).slice(1);
  tables.forEach((table, tableIndex) => {
    const body = table.split(/<\/table>/i)[0] ?? "";
    const rawRows = body.split(/<tr/i).slice(1);
    rawRows.forEach((raw, rowIndex) => {
      const cells = raw.split(/<t[dh]/i).slice(1).map((cell) => cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      const row = rowFromValues(`t${tableIndex + 1}`, rowIndex + 1, cells);
      const anchored = { ...row, anchor: `t${tableIndex + 1}:r${rowIndex + 1}` };
      rows.push(anchored);
      chunks.push({ anchor: anchored.anchor, kind: "table_row", content: cells.join(" | "), ord: chunks.length });
    });
  });
  return { chunks, rows };
}

export async function parseDocx(bytes: Uint8Array): Promise<ParsedDocument> {
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const built = tableChunks(result.value);
  return { kind: "docx", pageCount: null, sheetNames: null, chunks: built.chunks.length > 0 ? built.chunks : chunksFromRows(built.rows, "text"), rows: built.rows };
}
