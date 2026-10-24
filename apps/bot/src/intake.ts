import type { ContractSummary } from "@certa/ai";
import { formatMoneyPair, formatNgnFromKobo } from "@certa/shared";
import { stageCountPhrase } from "../../../src/server/intake/messages.js";

/** Matches CertaEscrow.MAX_STAGES. */
export const MAX_CONTRACT_STAGES = 64;
const MAX_QUESTIONS = 8;

export type GapQuestion = { id: string; prompt: string };

const MIME_NAME: Record<string, string> = {
  "application/pdf": "contract.pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "contract.docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "contract.xlsx",
  "text/csv": "contract.csv",
  "text/plain": "contract.txt",
  "image/jpeg": "page.jpg",
  "image/png": "page.png",
  "image/heic": "page.heic",
};

export function filenameOf(file: { file_name?: string; mime_type?: string }): string | null {
  const named = file.file_name?.split(/[/\\]/).pop()?.trim() ?? "";
  if (/\.(pdf|docx|xlsx|xls|csv|txt|jpe?g|png|heic)$/i.test(named)) return named;
  return MIME_NAME[file.mime_type ?? ""] ?? null;
}

export function contractNote(summary: Pick<ContractSummary, "stages" | "contractSumKobo">, koboPerUsdc?: bigint): string {
  const sum = BigInt(summary.contractSumKobo);
  const money = koboPerUsdc ? formatMoneyPair(sum, koboPerUsdc) : formatNgnFromKobo(sum);
  const shown = summary.stages.slice(0, 30).map((stage, index) => `${index + 1}. ${stage.name}`);
  const rest = summary.stages.length - shown.length;
  if (rest > 0) shown.push(`${rest} further stages are on the project.`);
  return [stageCountPhrase(summary.stages.length), money, "", ...shown].join("\n");
}

export function contractGaps(summary: ContractSummary): GapQuestion[] {
  const questions: GapQuestion[] = [];
  const named = (pattern: RegExp) => summary.parties.some((party) => pattern.test(party.role) && party.name.trim().length > 1);
  if (!named(/client|employer/i)) questions.push({ id: "client", prompt: "Who is the client on this contract?" });
  if (!named(/contractor/i)) questions.push({ id: "contractor", prompt: "Who is the contractor?" });
  questions.push({ id: "site", prompt: "Where is the site? Send the address." });
  if (summary.retentionBps === 0) questions.push({ id: "retention", prompt: "What retention percent does the contract hold? Reply with a number, or none." });
  if (summary.defectsPeriodDays === 0) questions.push({ id: "defects", prompt: "How many days is the defects period? Reply with a number, or none." });
  if (summary.mobilisationBps === 0) questions.push({ id: "mobilisation", prompt: "What mobilisation percent is paid up front? Reply with a number, or none." });
  if (!summary.liquidatedDamages.trim()) questions.push({ id: "damages", prompt: "What liquidated damages does the contract state? Reply with the clause, or none." });
  if (summary.deadlines.length === 0) questions.push({ id: "deadline", prompt: "What is the completion date? Reply with the date, or none." });
  for (const [index, item] of summary.ambiguities.entries()) {
    if (questions.length >= MAX_QUESTIONS) break;
    questions.push({ id: `ambiguity:${index}`, prompt: item });
  }
  return questions.slice(0, MAX_QUESTIONS);
}

function none(text: string): boolean {
  return /^(none|no|n\/a|nil|0)$/i.test(text.trim());
}

function readPercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

export function applyGapAnswer(
  summary: ContractSummary,
  id: string,
  raw: string,
): { ok: true; summary: ContractSummary; site?: string } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "Reply in words, or none." };
  const next: ContractSummary = {
    ...summary,
    parties: summary.parties.map((party) => ({ ...party })),
    stages: summary.stages.map((stage) => ({ ...stage })),
    deadlines: [...summary.deadlines],
    ambiguities: [...summary.ambiguities],
  };
  if (id === "client" || id === "contractor") {
    if (text.length < 2 || none(text)) return { ok: false, reason: "Send the name." };
    next.parties.push({ role: id, name: text });
    return { ok: true, summary: next };
  }
  if (id === "site") {
    if (text.length < 3 || none(text)) return { ok: false, reason: "Send the site address." };
    return { ok: true, summary: next, site: text };
  }
  if (id === "retention" || id === "mobilisation") {
    if (none(text)) return { ok: true, summary: next };
    const bps = readPercent(text);
    if (bps === null) return { ok: false, reason: "Reply with a percent, or none." };
    if (id === "retention") next.retentionBps = bps;
    else next.mobilisationBps = bps;
    return { ok: true, summary: next };
  }
  if (id === "defects") {
    if (none(text)) return { ok: true, summary: next };
    const days = Number(text.match(/(\d+)/)?.[1]);
    if (!Number.isInteger(days) || days < 0 || days > 3650) return { ok: false, reason: "Reply with the number of days, or none." };
    next.defectsPeriodDays = days;
    return { ok: true, summary: next };
  }
  if (id === "damages") {
    next.liquidatedDamages = none(text) ? "None stated." : text;
    return { ok: true, summary: next };
  }
  if (id === "deadline") {
    if (!none(text)) next.deadlines.push(text);
    return { ok: true, summary: next };
  }
  if (id.startsWith("ambiguity:")) {
    const index = Number(id.slice("ambiguity:".length));
    const previous = next.ambiguities[index];
    if (previous) next.ambiguities[index] = `${previous} Answer: ${none(text) ? "None stated." : text}`;
    return { ok: true, summary: next };
  }
  return { ok: false, reason: "Reply in words, or none." };
}

export function savedContractMessage(stageCount: number, code: string): string {
  return [
    `${stageCount === 1 ? "1 stage is saved." : `${stageCount} stages are saved.`}`,
    "Money stays unlocked until both sides accept this summary.",
    `Contractor code: ${code}`,
    "The site pin is not on the map yet.",
  ].join("\n");
}

export function readFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Send ") || message.startsWith("That file is not")) return message;
  if (message.includes("No table")) return "No stage table was found in that file, and the contract model is not configured.";
  if (message.includes("tool")) return "That file tried to give instructions. It was refused.";
  return "That file could not be read into stages.";
}
