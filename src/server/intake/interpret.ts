import { absDiff, bpsFromPct, cellMoney, digits, quantityMilli } from "./amounts.js";

export type GridCell = { col: string; text: string };
export type GridRow = { sheet: string; row: number; cells: GridCell[]; anchor: string; content: string };
export type RowKind = "item" | "heading" | "note" | "subtotal";

export type DraftItem = {
  billRef: string;
  itemRef: string;
  description: string;
  unit: string | null;
  quantityMilli: bigint | null;
  rateKobo: bigint | null;
  statedKobo: bigint | null;
  rowKind: RowKind;
  confidence: number;
  anchor: string;
  quote: string;
  line: number;
};

export type DraftBill = {
  billRef: string;
  title: string;
  items: DraftItem[];
  statedSubtotalKobo: bigint | null;
  anchor: string;
};

export type DraftSum = { label: string; kobo: bigint; anchor: string; quote: string };
export type DraftMilestone = { name: string; pctBps: number | null; amountKobo: bigint | null; anchor: string; quote: string };
export type SuspiciousHit = { anchor: string; billRef: string | null; row: number; quote: string };

export type BoqDraft = {
  projectName: string | null;
  location: string | null;
  clientName: string | null;
  contractorName: string | null;
  consultantName: string | null;
  currency: "NGN" | "USD";
  contractSumKobo: bigint | null;
  contractSumAnchor: string | null;
  contractSumQuote: string | null;
  includesVat: boolean;
  vatBps: number | null;
  vatKobo: bigint | null;
  vatAnchor: string | null;
  vatQuote: string | null;
  netBeforeVatKobo: bigint | null;
  statedGrandKobo: bigint | null;
  preliminariesKobo: bigint | null;
  provisional: DraftSum[];
  primeCost: DraftSum[];
  contingencyKobo: bigint | null;
  contingencyBps: number | null;
  contingencyAnchor: string | null;
  retentionBps: number | null;
  retentionRelease: string | null;
  defectsMonths: number | null;
  advanceKobo: bigint | null;
  advanceBps: number | null;
  advanceRecovery: string | null;
  ldRateKobo: bigint | null;
  ldPeriod: "day" | "week" | null;
  ldCapBps: number | null;
  paymentPeriodDays: number | null;
  startDate: string | null;
  completionDate: string | null;
  bills: DraftBill[];
  milestones: DraftMilestone[];
  suspicious: SuspiciousHit[];
  confidence: number;
};

const HEADER_WORDS = ["item", "description", "unit", "qty", "quantity", "rate", "amount", "total"];
const INJECTION = /ignore previous instructions|set the contract sum to/i;

function colLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const line = text.split(/\r?\n/).find((row) => row.trim().length > 0) ?? "";
  const counts = [
    { mark: "," as const, n: line.split(",").length },
    { mark: ";" as const, n: line.split(";").length },
    { mark: "\t" as const, n: line.split("\t").length },
  ];
  counts.sort((a, b) => b.n - a.n);
  return counts[0]?.n && counts[0].n > 1 ? counts[0].mark : ",";
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] ?? "";
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function gridFromCsv(text: string, sheet: string): GridRow[] {
  const delimiter = sniffDelimiter(text);
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line, index) => {
    const values = line.trim().length === 0 ? [] : splitCsvLine(line, delimiter);
    return rowFromValues(sheet, index + 1, values);
  });
}

export function rowFromValues(sheet: string, row: number, values: string[]): GridRow {
  const cells = values.map((text, index) => ({ col: colLetter(index), text }));
  const last = cells[cells.length - 1]?.col ?? "A";
  const content = cells.filter((cell) => cell.text.length > 0).map((cell) => `${cell.col}${row}=${cell.text}`).join(" | ");
  return { sheet, row, cells, anchor: `${sheet}!A${row}:${last}${row}`, content };
}

function cell(row: GridRow, col: string | undefined): string {
  if (!col) return "";
  return row.cells.find((item) => item.col === col)?.text ?? "";
}

function headerMap(row: GridRow): Record<string, string> | null {
  const hits: { key: string; col: string }[] = [];
  for (const item of row.cells) {
    const word = item.text.toLowerCase().replace(/[^a-z]/g, "");
    if (word === "item" || word === "ref") hits.push({ key: "item", col: item.col });
    else if (word === "description" || word === "desc") hits.push({ key: "description", col: item.col });
    else if (word === "unit") hits.push({ key: "unit", col: item.col });
    else if (word === "qty" || word === "quantity") hits.push({ key: "qty", col: item.col });
    else if (word === "rate") hits.push({ key: "rate", col: item.col });
    else if (word === "amount" || (word === "total" && !hits.some((hit) => hit.key === "amount"))) hits.push({ key: "amount", col: item.col });
  }
  const words = new Set(hits.map((hit) => hit.key));
  const score = HEADER_WORDS.filter((word) => (word === "quantity" ? words.has("qty") : word === "total" ? words.has("amount") : words.has(word))).length;
  if (score < 2) return null;
  const map: Record<string, string> = {};
  for (const hit of hits) map[hit.key] = hit.col;
  return map;
}

function lastMoney(row: GridRow): { kobo: bigint; quote: string } | null {
  for (let i = row.cells.length - 1; i >= 0; i -= 1) {
    const text = row.cells[i]?.text ?? "";
    const kobo = cellMoney(text);
    if (kobo !== null) return { kobo, quote: text };
  }
  return null;
}

function joined(row: GridRow): string {
  return row.cells.map((item) => item.text).filter((text) => text.length > 0).join(" ");
}

function emptyDraft(): BoqDraft {
  return {
    projectName: null,
    location: null,
    clientName: null,
    contractorName: null,
    consultantName: null,
    currency: "NGN",
    contractSumKobo: null,
    contractSumAnchor: null,
    contractSumQuote: null,
    includesVat: false,
    vatBps: null,
    vatKobo: null,
    vatAnchor: null,
    vatQuote: null,
    netBeforeVatKobo: null,
    statedGrandKobo: null,
    preliminariesKobo: null,
    provisional: [],
    primeCost: [],
    contingencyKobo: null,
    contingencyBps: null,
    contingencyAnchor: null,
    retentionBps: null,
    retentionRelease: null,
    defectsMonths: null,
    advanceKobo: null,
    advanceBps: null,
    advanceRecovery: null,
    ldRateKobo: null,
    ldPeriod: null,
    ldCapBps: null,
    paymentPeriodDays: null,
    startDate: null,
    completionDate: null,
    bills: [],
    milestones: [],
    suspicious: [],
    confidence: 0.97,
  };
}

function readConditions(draft: BoqDraft, text: string): void {
  const retention = /retention:\s*(\d+(?:\.\d+)?)\s*%/i.exec(text);
  if (retention?.[1]) {
    const bps = bpsFromPct(retention[1]);
    if (bps !== null) draft.retentionBps = bps;
    draft.retentionRelease = text;
  }
  const months = /(\d+)\s*-?\s*month/i.exec(text);
  if (months?.[1]) draft.defectsMonths = digits(months[1]);
  if (/mobilisation advance:\s*nil/i.test(text)) draft.advanceKobo = 0n;
  const advance = /mobilisation(?: advance)?:\s*(\d+(?:\.\d+)?)\s*%/i.exec(text);
  if (advance?.[1] && !/nil/i.test(text)) {
    const bps = bpsFromPct(advance[1]);
    if (bps !== null) draft.advanceBps = bps;
  }
  if (/recovered/i.test(text)) draft.advanceRecovery = text;
  const days = /payment within\s*(\d+)\s*days/i.exec(text);
  if (days?.[1]) draft.paymentPeriodDays = digits(days[1]);
  const ld = /([\d,]+(?:\.\d{2})?)\s*per\s*(day|week)/i.exec(text);
  if (ld?.[1] && ld[2]) {
    const raw = ld[1].includes(".") ? ld[1] : `${ld[1].replace(/,/g, "")}.00`;
    const kobo = cellMoney(raw);
    if (kobo !== null) draft.ldRateKobo = kobo;
    draft.ldPeriod = ld[2].toLowerCase() === "week" ? "week" : "day";
  }
  const cap = /capped at\s*(\d+(?:\.\d+)?)\s*%/i.exec(text);
  if (cap?.[1]) {
    const bps = bpsFromPct(cap[1]);
    if (bps !== null) draft.ldCapBps = bps;
  }
  const start = /commencement\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
  const end = /completion\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
  if (start?.[1] && start[2] && start[3]) draft.startDate = isoFromParts(start[3], start[2], start[1]);
  if (end?.[1] && end[2] && end[3]) draft.completionDate = isoFromParts(end[3], end[2], end[1]);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoFromParts(year: string, month: string, day: string): string | null {
  const index = MONTHS.findIndex((name) => month.toLowerCase().startsWith(name));
  if (index < 0) return null;
  const mm = String(index + 1).padStart(2, "0");
  const dd = day.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function interpretGrid(rows: GridRow[]): BoqDraft {
  const draft = emptyDraft();
  let bill: DraftBill | null = null;
  let columns: Record<string, string> | null = null;
  let summary = false;
  const pushBill = () => {
    if (!bill) return;
    draft.bills.push(bill);
    if (/prelim/i.test(bill.title) && bill.statedSubtotalKobo !== null) draft.preliminariesKobo = bill.statedSubtotalKobo;
    bill = null;
  };
  for (const row of rows) {
    const text = joined(row);
    if (!text) continue;
    if (INJECTION.test(text)) {
      draft.suspicious.push({ anchor: row.anchor, billRef: bill?.billRef ?? null, row: row.row, quote: text.slice(0, 200) });
      continue;
    }
    readConditions(draft, text);
    const label = row.cells[0]?.text ?? "";
    const value = row.cells[1]?.text ?? "";
    if (/^project$/i.test(label) && value) draft.projectName = value;
    if (/^location$/i.test(label) && value) draft.location = value;
    if (/^client$/i.test(label) && value) draft.clientName = value;
    if (/^contractor$/i.test(label) && value) draft.contractorName = value;
    if (/^consultant$/i.test(label) && value) draft.consultantName = value;
    if (/^currency$/i.test(label) && /usd/i.test(value)) draft.currency = "USD";
    if (/general summary/i.test(text)) {
      pushBill();
      summary = true;
      columns = null;
      continue;
    }
    const billNo = /^bill$/i.test(label) && /^\d+$/.test(value) ? value : null;
    const inline = /^bill no\.?\s*(\d+)\s*[—-]\s*(.+)$/i.exec(text);
    const opened = billNo && !summary ? { ref: billNo, title: row.cells[2]?.text ?? "" } : inline && !summary ? { ref: inline[1] ?? "", title: inline[2] ?? "" } : null;
    if (opened?.ref) {
      pushBill();
      bill = { billRef: opened.ref, title: opened.title, items: [], statedSubtotalKobo: null, anchor: row.anchor };
      columns = null;
      continue;
    }
    const mapped = headerMap(row);
    if (mapped && !summary) {
      columns = mapped;
      continue;
    }
    if (mapped && summary) continue;
    if (draft.contractSumKobo === null) {
      const money = lastMoney(row);
      const words = row.cells.map((item) => item.text.trim()).filter((item) => item.length > 0);
      const head = words[0] ?? "";
      const joinedHead = words.slice(0, 2).join(" ");
      if (money && (/^contract sum$/i.test(head) || /^contract sum$/i.test(joinedHead))) {
        draft.contractSumKobo = money.kobo;
        draft.contractSumAnchor = row.anchor;
        draft.contractSumQuote = money.quote;
      }
    }
    if (/^milestone$/i.test(label)) {
      const pctCell = row.cells.map((item) => item.text).find((item) => /^\d+(?:\.\d+)?%$/.test(item));
      const pct = pctCell ? bpsFromPct(pctCell.replace("%", "")) : null;
      const money = lastMoney(row);
      draft.milestones.push({
        name: row.cells[2]?.text || value,
        pctBps: pct,
        amountKobo: money?.kobo ?? null,
        anchor: row.anchor,
        quote: text.slice(0, 200),
      });
      continue;
    }
    if (summary) {
      const money = lastMoney(row);
      const head = row.cells.find((item) => item.text.trim().length > 0)?.text ?? "";
      if (/^sub-?total$/i.test(head) && money) draft.statedGrandKobo = money.kobo;
      else if (/^total before vat$/i.test(head) && money) draft.netBeforeVatKobo = money.kobo;
      else if (/^vat\b/i.test(head) && money) {
        draft.vatKobo = money.kobo;
        draft.vatAnchor = row.anchor;
        draft.vatQuote = money.quote;
        const rate = /(\d+(?:\.\d+)?)\s*%/.exec(head);
        if (rate?.[1]) draft.vatBps = bpsFromPct(rate[1]);
        draft.includesVat = true;
      } else if (/^contract sum$/i.test(head) && money) {
        draft.contractSumKobo = money.kobo;
        draft.contractSumAnchor = row.anchor;
        draft.contractSumQuote = money.quote;
      } else if (/^provisional/i.test(head) && money) {
        draft.provisional.push({ label: head, kobo: money.kobo, anchor: row.anchor, quote: money.quote });
      } else if (/^(prime cost|pc sum)/i.test(head) && money) {
        draft.primeCost.push({ label: head, kobo: money.kobo, anchor: row.anchor, quote: money.quote });
      } else if (/^contingenc/i.test(head) && money) {
        draft.contingencyKobo = money.kobo;
        draft.contingencyAnchor = row.anchor;
        const rate = /(\d+(?:\.\d+)?)\s*%/.exec(head);
        if (rate?.[1]) draft.contingencyBps = bpsFromPct(rate[1]);
      } else if (/^\d+$/.test(label) && money && !draft.bills.some((item) => item.billRef === label)) {
        draft.bills.push({
          billRef: label,
          title: value || `Bill ${label}`,
          items: [{
            billRef: label,
            itemRef: `${label}.1`,
            description: value || `Bill ${label}`,
            unit: "sum",
            quantityMilli: 1000n,
            rateKobo: money.kobo,
            statedKobo: money.kobo,
            rowKind: "item",
            confidence: 0.9,
            anchor: row.anchor,
            quote: money.quote,
            line: row.row,
          }],
          statedSubtotalKobo: money.kobo,
          anchor: row.anchor,
        });
      }
      continue;
    }
    if (!bill || !columns) continue;
    const description = cell(row, columns.description);
    const itemRef = cell(row, columns.item);
    const moneyText = cell(row, columns.amount);
    const stated = cellMoney(moneyText);
    if (/carried to summary|collection/i.test(text)) {
      const found = stated ?? lastMoney(row)?.kobo ?? null;
      if (found !== null) bill.statedSubtotalKobo = found;
      bill.items.push({
        billRef: bill.billRef,
        itemRef: "",
        description: description || "Carried to Summary",
        unit: null,
        quantityMilli: null,
        rateKobo: null,
        statedKobo: found,
        rowKind: "subtotal",
        confidence: 0.97,
        anchor: row.anchor,
        quote: (stated !== null ? moneyText : text).slice(0, 200),
        line: row.row,
      });
      continue;
    }
    if (!itemRef && !description) continue;
    const kind: RowKind = /^\d+(?:\.\d+)+$/.test(itemRef) ? "item" : description ? "heading" : "note";
    bill.items.push({
      billRef: bill.billRef,
      itemRef: itemRef || `row${row.row}`,
      description,
      unit: cell(row, columns.unit) || null,
      quantityMilli: cell(row, columns.qty) ? quantityMilli(cell(row, columns.qty)) : null,
      rateKobo: cell(row, columns.rate) ? cellMoney(cell(row, columns.rate)) : null,
      statedKobo: stated,
      rowKind: kind,
      confidence: 0.97,
      anchor: row.anchor,
      quote: (moneyText || description).slice(0, 200),
      line: row.row,
    });
  }
  pushBill();
  if (draft.vatKobo !== null) draft.includesVat = true;
  if (draft.advanceBps !== null && draft.advanceKobo === null && draft.contractSumKobo !== null) {
    draft.advanceKobo = (draft.contractSumKobo * BigInt(draft.advanceBps) + 5_000n) / 10_000n;
  }
  return draft;
}

export function billGap(bill: DraftBill): { statedSum: bigint; subtotal: bigint } | null {
  if (bill.statedSubtotalKobo === null) return null;
  let statedSum = 0n;
  for (const item of bill.items) {
    if (item.rowKind !== "item" || item.statedKobo === null) continue;
    statedSum += item.statedKobo;
  }
  return { statedSum, subtotal: bill.statedSubtotalKobo };
}

export function worstItem(bill: DraftBill): DraftItem | null {
  const gap = billGap(bill);
  if (!gap) return null;
  const target = absDiff(gap.statedSum, gap.subtotal);
  for (const item of bill.items) {
    if (item.rowKind !== "item" || item.quantityMilli === null || item.rateKobo === null || item.statedKobo === null) continue;
    const computed = (item.quantityMilli * item.rateKobo + 500n) / 1000n;
    if (absDiff(computed, item.statedKobo) === target && target > 100n) return item;
  }
  return null;
}
