import { appBaseUrl } from "../../lib/appUrl.js";
import { countNoun } from "../../lib/count-noun.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { digits } from "./amounts.js";

export function gotFile(fileName: string, pagesOrSheets: string): string {
  return `Got it: ${fileName} (${pagesOrSheets}). Send more files, or tap Done when you've sent everything.`;
}

export const READING =
  "Reading your documents now. This usually takes 1–3 minutes for a contract and BoQ. I'll message you when the figures are ready.";

export function badType(ext: string): string {
  return `I can't read this type of file (${ext}). Please send a PDF, Word, Excel or CSV file, or a clear photo of each page.`;
}

export const ENCRYPTED =
  "This file is password-protected, so I can't open it. Please remove the password and send it again.";

export function unreadable(fileName: string): string {
  return `I couldn't read ${fileName}. If it's a scan or photo, please take it again in good light, flat, with the whole page in view.`;
}

export function readFailed(fileName: string, detail: string): string {
  return `I couldn't read ${fileName}. ${detail} Tap Retry to try that file again.`;
}

export function telegramTooBig(appUrl: string, projectId: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `This file is bigger than 20 MB, which is Telegram's limit for bots. Please upload it on the web at ${base}/app/p/${projectId}/documents, or send it in smaller parts.`;
}

export function duplicateUpload(fileName: string, date: string): string {
  return `You've already sent this file (${fileName}, ${date}).`;
}

export const WEB_DUPLICATE_PREFIX = "You've already uploaded this file";

export function webDuplicate(fileName: string, date: string): string {
  return `You've already uploaded this file (${fileName}, ${date}).`;
}

export const UPLOAD_DROPPED = "Upload failed: the connection dropped. Your file wasn't saved. Try again.";

export function totalsBlocked(count: number): string {
  return `Totals don't reconcile yet: fix the ${countNoun(count, "red item")} before sending.`;
}

export const AGREED_LOCKED =
  "You can't change an agreed plan directly. Propose a change instead — both sides must accept it.";

export const SCAN_V13 = "This looks like a scan or photo, please upload a text PDF, CSV or Excel";

export const MODEL_SLOW =
  "Reading the documents is taking longer than usual. I'll keep trying and message you within 30 minutes. Nothing has been lost.";

export function reviewLink(projectId: string): string {
  const base = appBaseUrl();
  return `${base}/app/p/${projectId}/contract/review`;
}

export function acceptDeepLink(projectId: string): string {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? "";
  if (bot) return `https://t.me/${bot}/app?startapp=contract_${projectId}`;
  return reviewLink(projectId);
}

export function stageCountPhrase(count: number): string {
  return countNoun(count, "stage");
}

const DUE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDue(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match?.[1] || !match[2] || !match[3]) return iso;
  const month = DUE_MONTHS[digits(match[2]) - 1];
  if (!month) return iso;
  return `${digits(match[3])} ${month} ${match[1]}`;
}

export function stageFigureLines(stages: { name: string; amountKobo: bigint; kind: string; itemIds: string[]; expectedFinish: string | null }[]): string[] {
  const lines: string[] = [];
  let number = 0;
  for (const stage of stages) {
    if (stage.kind === "reserve") continue;
    number += 1;
    const count = stage.itemIds.length > 0 ? ` (${countNoun(stage.itemIds.length, "item")})` : "";
    const due = stage.expectedFinish ? ` · due ${formatDue(stage.expectedFinish)}` : "";
    lines.push(`${number}. ${stage.name} — ${formatNaira(stage.amountKobo)}${count}${due}`);
  }
  const reserve = stages.find((stage) => stage.kind === "reserve");
  if (reserve) lines.push(`Reserve for variations: ${formatNaira(reserve.amountKobo)}`);
  return lines;
}

export function basisLine(plan: { basis: string; issues: { code: string; message: string }[] }): string {
  const single = plan.issues.find((issue) => issue.code === "single_stage");
  if (single) return single.message;
  if (plan.basis === "contract_milestones") return "Stages come from the contract's payment schedule.";
  return "Stages come from the bills in your BoQ.";
}

export function figureNotes(plan: { issues: { code: string; message: string }[] }): string[] {
  return plan.issues.filter((issue) => issue.code === "V19" || issue.code === "V20").map((issue) => issue.message);
}

export function figuresReady(input: {
  project: string;
  sum: string;
  vatPct: string;
  stages: number;
  retentionPct: string;
  months: number;
  warnings: number;
  link: string;
  lines?: string[];
  basis?: string | null;
  notes?: string[];
}): string {
  return [
    `Figures ready for ${input.project}:`,
    `Contract sum: ${input.sum} (VAT ${input.vatPct}% included)`,
    `Stages: ${stageCountPhrase(input.stages)} · Retention: ${input.retentionPct}% · Defects period: ${countNoun(input.months, "month")}`,
    ...(input.basis ? [input.basis] : []),
    ...(input.notes ?? []),
    `${countNoun(input.warnings, "thing")} to check.`,
    ...(input.lines ?? []),
    "Tap Review figures to check each one against your documents.",
    input.link,
  ].join("\n");
}

export function planShared(input: {
  clientName: string;
  project: string;
  sum: string;
  stageLines: string;
  retentionPct: string;
  months: number;
  link?: string;
  forClient?: boolean;
}): string {
  const opening = input.forClient
    ? `Your payment plan for ${input.project} has been sent to the contractor.`
    : `${input.clientName} has shared the payment plan for ${input.project}.`;
  return [
    opening,
    `Contract sum: ${input.sum}`,
    input.stageLines,
    `Retention: ${input.retentionPct}% until ${countNoun(input.months, "month")} after completion.`,
    "Tap Accept below, or Review plan to see each figure.",
  ].join("\n");
}

export function replyReminder(project: string, hoursLeft: number): string {
  return `Reminder: the payment plan for ${project} is waiting for your answer. ${countNoun(hoursLeft, "hour")} left before it goes to the consultant.`;
}

export function watStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")} ${pick("month")} ${pick("year")}, ${pick("hour")}:${pick("minute")} WAT`;
}
