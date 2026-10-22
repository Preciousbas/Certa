import { nairaToKobo } from "@certa/shared";
import { textFromUpload } from "./files.js";
import { extractContract, type ParsedContract } from "./parse.js";
import { parseSummary, type LanguageModel } from "./schema.js";

const INJECTION = /ignore previous instructions|release all funds|system prompt/i;

export type BoqLine = {
  ref: string;
  description: string;
  unit: string;
  quantityMilli: bigint;
  rateKobo: bigint;
  statedKobo: bigint;
  computedKobo: bigint;
  where: string;
};

export type BoqSection = { name: string; lines: BoqLine[] };

const STAGE_CRITERIA: { test: RegExp; criteria: string }[] = [
  { test: /clear|setting out/i, criteria: "The plot is cleared and the building lines are marked." },
  { test: /excav|foundat|blind|substructure|footing/i, criteria: "Excavation, blinding, and the foundation concrete are in place." },
  { test: /slab|oversite|deck/i, criteria: "The slab is poured and the surface is visible." },
  { test: /column|blockwork/i, criteria: "The columns and blockwork for this level are up." },
  { test: /roof/i, criteria: "The roof structure and covering are on." },
  { test: /finish|plaster|tile|window|door/i, criteria: "The finishes named in this section are in place." },
  { test: /external|drainage|handover/i, criteria: "External works are done and the site is ready to hand over." },
];

export function sniffDocument(filename: string, bytes: Uint8Array): "pdf" | "docx" | "xlsx" | "xls" | "csv" | "jpeg" | "png" | "heic" | null {
  const name = filename.toLowerCase();
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = Buffer.from(bytes.subarray(8, 12)).toString("ascii").toLowerCase();
    if (brand.startsWith("hei") || brand === "mif1") return "heic";
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "xls";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (name.endsWith(".xlsx")) return "xlsx";
    if (name.endsWith(".docx")) return "docx";
    return name.endsWith(".xls") ? "xls" : "xlsx";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if ((name.endsWith(".csv") || name.endsWith(".txt")) && !bytes.includes(0)) return "csv";
  return null;
}

function cells(line: string): string[] {
  if (line.includes("|")) return line.split("|").map((cell) => cell.trim());
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  return [line.trim()];
}

function quantityMilli(raw: string): bigint | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!match?.[1]) return null;
  const frac = (match[2] ?? "").padEnd(3, "0");
  return BigInt(match[1]) * 1000n + BigInt(frac);
}

function moneyKobo(raw: string): bigint | null {
  const cleaned = raw.replace(/[₦,\s]/g, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match?.[1]) return null;
  const frac = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(frac);
}

function formatQty(milli: bigint): string {
  const whole = milli / 1000n;
  const frac = (milli % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function formatNaira(kobo: bigint): string {
  const whole = kobo / 100n;
  const rem = kobo % 100n;
  const body = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rem === 0n ? body : `${body}.${rem.toString().padStart(2, "0")}`;
}

function criteriaFor(name: string): string {
  return STAGE_CRITERIA.find((item) => item.test.test(name))?.criteria ?? `The work described under ${name} is complete and can be seen in a photo.`;
}

export function billFromText(text: string, sheet = "Sheet1"): { sections: BoqSection[]; issues: string[]; contractSumKobo: bigint | null; retentionBps: number; defectsPeriodDays: number; mobilisationBps: number; vatBps: number } | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return /item/.test(lower) && /desc/.test(lower) && /qty|quantity/.test(lower) && /rate/.test(lower) && /amount/.test(lower);
  });
  if (header < 0) return null;
  const heads = cells(lines[header] ?? "").map((cell) => cell.toLowerCase());
  const at = (name: RegExp) => heads.findIndex((cell) => name.test(cell));
  const refAt = at(/^item/);
  const descAt = at(/desc/);
  const unitAt = at(/unit/);
  const qtyAt = at(/qty|quantity/);
  const rateAt = at(/rate/);
  const amountAt = at(/amount/);
  if (descAt < 0 || qtyAt < 0 || rateAt < 0 || amountAt < 0) return null;

  const sections: BoqSection[] = [];
  let current: BoqSection = { name: "Measured work", lines: [] };
  sections.push(current);
  const issues: string[] = [];
  let contractSumKobo: bigint | null = null;
  let retentionBps = 0;
  let defectsPeriodDays = 0;
  let mobilisationBps = 0;
  let vatBps = 0;
  if (INJECTION.test(text)) issues.push("The file contained instructions aimed at the extractor. They were ignored.");

  lines.slice(header + 1).forEach((line, offset) => {
    const where = `${sheet} row ${header + offset + 2}`;
    const parts = cells(line);
    const label = (parts[0] ?? "").toLowerCase();
    if (label.startsWith("contract sum")) {
      const naira = BigInt((parts[1] ?? "0").replace(/[^\d]/g, "") || "0");
      contractSumKobo = nairaToKobo(naira);
      return;
    }
    if (label.startsWith("retention")) {
      retentionBps = Number(parts[1] ?? 0) * 100;
      return;
    }
    if (label.startsWith("defects")) {
      defectsPeriodDays = Number((parts[1] ?? "0").replace(/[^\d]/g, ""));
      return;
    }
    if (label.startsWith("mobilisation") || label.startsWith("mobilization")) {
      mobilisationBps = Number(parts[1] ?? 0) * 100;
      return;
    }
    if (label.startsWith("vat")) {
      vatBps = Math.round(Number(parts[1] ?? 0) * 100);
      return;
    }
    const qty = quantityMilli(parts[qtyAt] ?? "");
    const rate = moneyKobo(parts[rateAt] ?? "");
    const stated = moneyKobo(parts[amountAt] ?? "");
    if (qty === null || rate === null || stated === null) {
      const title = parts.filter(Boolean).join(" ").trim();
      if (title && current.lines.length > 0) {
        current = { name: title, lines: [] };
        sections.push(current);
      } else if (title && current.lines.length === 0 && current.name === "Measured work") {
        current.name = title;
      }
      return;
    }
    const computed = (qty * rate) / 1000n;
    const ref = refAt >= 0 ? (parts[refAt] ?? "") : "";
    const description = parts[descAt] ?? "";
    if (computed !== stated) {
      issues.push(`${where}, ${ref || description}: ${formatQty(qty)} x ${formatNaira(rate)} should be ${formatNaira(computed)} but the document says ${formatNaira(stated)}.`);
    }
    current.lines.push({
      ref,
      description,
      unit: unitAt >= 0 ? (parts[unitAt] ?? "") : "",
      quantityMilli: qty,
      rateKobo: rate,
      statedKobo: stated,
      computedKobo: computed,
      where,
    });
  });

  const filled = sections.filter((section) => section.lines.length > 0);
  if (filled.length === 0) return null;
  return { sections: filled, issues, contractSumKobo, retentionBps, defectsPeriodDays, mobilisationBps, vatBps };
}

export function contractFromBill(text: string, sheet = "Sheet1"): ParsedContract | null {
  const bill = billFromText(text, sheet);
  if (!bill) return null;
  const issues = [...bill.issues];
  let net = 0n;
  const stages = bill.sections.map((section) => {
    const amount = section.lines.reduce((sum, line) => sum + line.computedKobo, 0n);
    net += amount;
    return { name: section.name, description: criteriaFor(section.name), amount };
  });
  const vat = bill.vatBps > 0 ? (net * BigInt(bill.vatBps)) / 10_000n : 0n;
  const gross = net + vat;
  const contractSum = bill.contractSumKobo ?? gross;
  if (bill.contractSumKobo !== null && bill.contractSumKobo !== gross && bill.contractSumKobo !== net) {
    issues.push(`The items add up to ${formatNaira(gross)} naira. The document states a different contract sum.`);
  }
  const target = bill.contractSumKobo === net ? net : gross;
  let allocated = 0n;
  const withShare = stages.map((stage, index) => {
    const amount = index === stages.length - 1 ? target - allocated : stage.amount;
    if (index !== stages.length - 1) allocated += amount;
    const percentBps = target === 0n ? 0 : Number((amount * 10_000n) / target);
    return { ...stage, amount, percentBps };
  });
  const sumCheck = withShare.reduce((sum, stage) => sum + stage.amount, 0n);
  if (sumCheck !== target) issues.push("The stage amounts do not add up to the contract sum.");
  const summary = parseSummary(
    {
      parties: [],
      contractSumKobo: target.toString(),
      currency: "NGN",
      stages: withShare.map((stage) => ({
        name: stage.name,
        description: stage.description,
        amountKobo: stage.amount.toString(),
        percentBps: stage.percentBps,
      })),
      retentionBps: bill.retentionBps,
      defectsPeriodDays: bill.defectsPeriodDays,
      mobilisationBps: bill.mobilisationBps,
      deadlines: [],
      paymentTerms: "Stage payments from the locked USDC after the stage is accepted.",
      liquidatedDamages: "",
      ambiguities: issues,
    },
    text,
  );
  return { summary, flags: issues };
}

export async function studyUpload(filename: string, bytes: Uint8Array, model?: LanguageModel): Promise<ParsedContract> {
  const kind = sniffDocument(filename, bytes);
  if (kind === "heic") throw new Error("Send a JPEG or PNG photo of the page.");
  if (kind === "jpeg" || kind === "png") throw new Error("Send the Excel bill or a PDF. A photo of the page is not read yet.");
  if (!kind) throw new Error("That file is not a PDF, Word, Excel, or CSV.");
  const text = await textFromUpload(filename, bytes);
  const bill = contractFromBill(text, filename);
  if (bill) return bill;
  return extractContract(text, model);
}
