import { bpsFromPct, cellMoney, digits, markedMoney, proseMoney } from "./amounts.js";

export type MoneyCell = { col: string; text: string };
export type MoneyRow = { cells: MoneyCell[] };

export type ScheduleColumns = {
  stage: string;
  name: string | null;
  pct: string | null;
  amount: string | null;
  due: string | null;
};

export type ScheduleHit = {
  name: string;
  pctBps: number | null;
  amountKobo: bigint | null;
  dueDate: string | null;
  quote: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function cell(row: MoneyRow, col: string | null): string {
  if (!col) return "";
  return row.cells.find((item) => item.col === col)?.text.trim() ?? "";
}

function joined(row: MoneyRow): string {
  return row.cells.map((item) => item.text.trim()).filter((text) => text.length > 0).join(" ");
}

export function isSummaryTitle(text: string): boolean {
  return /^(summary|general summary|summary of bills)$/i.test(text.trim());
}

export function findDueDate(text: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso?.[1] && iso[2] && iso[3] && realDate(digits(iso[1]), digits(iso[2]) - 1, digits(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const named = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/.exec(text);
  if (named?.[1] && named[2] && named[3]) {
    const month = MONTHS.findIndex((name) => named[2]?.toLowerCase().startsWith(name));
    const day = digits(named[1]);
    const year = digits(named[3]);
    if (month >= 0 && realDate(year, month, day)) {
      return `${named[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const slash = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (slash?.[1] && slash[2] && slash[3]) {
    const day = digits(slash[1]);
    const month = digits(slash[2]) - 1;
    const year = digits(slash[3]);
    if (realDate(year, month, day)) {
      return `${slash[3]}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function realDate(year: number, month: number, day: number): boolean {
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}

export function statedStageCount(text: string): number | null {
  const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*\(\s*(\d+)\s*\)\s*stages?\b/i.exec(text);
  if (word?.[2] && /^\d+$/.test(word[2])) return digits(word[2]);
  const plain = /\b(?:in\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+stages?\b/i.exec(text);
  if (!plain?.[1]) return null;
  if (/^\d+$/.test(plain[1])) return digits(plain[1]);
  return NUMBER_WORDS[plain[1].toLowerCase()] ?? null;
}

export function isContractSumRow(row: MoneyRow, text: string): boolean {
  const words = row.cells.map((item) => item.text.trim()).filter((item) => item.length > 0);
  const head = words[0] ?? "";
  const two = words.slice(0, 2).join(" ");
  if (/^contract\s+sum$/i.test(head) || /^contract\s+sum$/i.test(two)) return true;
  return /^(?:the\s+)?contract\s+sum\s*(?:is\b|:)/i.test(text.trim());
}

export function contractSumAmount(row: MoneyRow, text: string): bigint | null {
  if (!isContractSumRow(row, text)) return null;
  const prose = /^(?:the\s+)?contract\s+sum\s*(?:is\b|:)\s*(.+)$/i.exec(text.trim());
  if (prose?.[1]) return proseMoney(prose[1]) ?? markedMoney(prose[1]);
  for (let i = row.cells.length - 1; i >= 0; i -= 1) {
    const value = row.cells[i]?.text ?? "";
    const money = markedMoney(value) ?? cellMoney(value);
    if (money !== null && !/^contract\s+sum$/i.test(value.trim())) return money;
  }
  return null;
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[:\s]+$/g, "").trim();
}

function percentOf(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (!match?.[1]) return null;
  return bpsFromPct(match[1]);
}

export function readProseSchedule(text: string): ScheduleHit | null {
  const trimmed = text.trim();
  const instalment = /^(\d+)(?:st|nd|rd|th)\s+instal(?:ment|lment)\s*\((\d+(?:\.\d+)?)%\)\s*(?:on\s+)?(.+)$/i.exec(trimmed);
  if (instalment?.[2] && instalment[3]) {
    return {
      name: cleanName(instalment[3]),
      pctBps: bpsFromPct(instalment[2]),
      amountKobo: proseMoney(trimmed),
      dueDate: findDueDate(trimmed),
      quote: trimmed.slice(0, 200),
    };
  }
  const lead = /^(?:stage|milestone|phase)\s*\d+\s*[-–—:]\s*(.+)$/i.exec(trimmed);
  if (!lead?.[1]) return null;
  const rest = lead[1];
  const named = /^(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*%(?:\s*\(([^)]+)\))?(.*)$/i.exec(rest);
  if (named?.[1] && named[2]) {
    const amount = named[3] ? proseMoney(named[3]) ?? markedMoney(named[3]) : proseMoney(rest);
    return {
      name: cleanName(named[1]),
      pctBps: bpsFromPct(named[2]),
      amountKobo: amount,
      dueDate: findDueDate(named[4] || rest),
      quote: trimmed.slice(0, 200),
    };
  }
  const dashed = /^(.+?)\s*[–—-]\s*(.+)$/.exec(rest);
  if (dashed?.[1] && dashed[2]) {
    return {
      name: cleanName(dashed[1]),
      pctBps: percentOf(dashed[2]),
      amountKobo: proseMoney(dashed[2]),
      dueDate: findDueDate(dashed[2]),
      quote: trimmed.slice(0, 200),
    };
  }
  const bare = cleanName(rest.replace(/:.*/, ""));
  if (!bare) return null;
  return {
    name: bare,
    pctBps: percentOf(rest),
    amountKobo: proseMoney(rest),
    dueDate: findDueDate(rest),
    quote: trimmed.slice(0, 200),
  };
}

function heading(text: string): string {
  return text.trim().toLowerCase().replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

export function scheduleHeader(row: MoneyRow): ScheduleColumns | null {
  let stage: string | null = null;
  let name: string | null = null;
  let pct: string | null = null;
  let amount: string | null = null;
  let due: string | null = null;
  for (const item of row.cells) {
    const word = heading(item.text);
    if (!word) continue;
    if (/^(item|qty|quantity|rate|unit)$/.test(word)) return null;
    if (!stage && /^(stages?|milestones?|payments?|instalments?|installments?)$/.test(word)) stage = item.col;
    else if (!name && /^(description|desc|name|activity|work)$/.test(word)) name = item.col;
    else if (!pct && /^(percentage|percent|pct|%)$/.test(word)) pct = item.col;
    else if (!amount && /^amounts?$/.test(word)) amount = item.col;
    else if (!due && /^(due date|due|date|completion date|completion)$/.test(word)) due = item.col;
  }
  if (!stage || (!pct && !amount)) return null;
  return { stage, name, pct, amount, due };
}

export function readScheduleRow(row: MoneyRow, columns: ScheduleColumns): ScheduleHit | null {
  const stageText = cell(row, columns.stage);
  const nameText = cell(row, columns.name) || stageText;
  if (/contract\s+sum/i.test(stageText) || /contract\s+sum/i.test(nameText)) return null;
  const pctText = cell(row, columns.pct);
  const amountText = cell(row, columns.amount);
  const dueText = cell(row, columns.due);
  const pctBps = percentOf(pctText);
  const amountKobo = amountText ? cellMoney(amountText) : null;
  if (pctBps === null && amountKobo === null) return null;
  const name = cleanName(nameText.replace(/^\d+$/, ""));
  if (!name) return null;
  return {
    name,
    pctBps,
    amountKobo,
    dueDate: findDueDate(dueText || joined(row)),
    quote: joined(row).slice(0, 200),
  };
}

export function markedRowMoney(row: MoneyRow): bigint | null {
  for (let i = row.cells.length - 1; i >= 0; i -= 1) {
    const money = markedMoney(row.cells[i]?.text ?? "");
    if (money !== null) return money;
  }
  return null;
}
