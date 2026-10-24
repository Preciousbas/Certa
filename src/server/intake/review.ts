import { extractions, type Database } from "@certa/db";
import { desc, eq } from "drizzle-orm";
import { moneyKobo } from "./amounts.js";
import { stageCountPhrase } from "./messages.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { koboToMicro } from "../../lib/money/fx.js";
import type { Issue } from "./validate.js";

type SavedStage = {
  name: string;
  amountKobo: string;
  amountMicro: string;
  acceptanceCriteria: string[];
  tags: string[];
  kind: string;
  billRefs: string[];
  netKobo?: string;
  number?: number;
};

type SavedItem = { itemRef?: string; description?: string; amountKobo?: string };

type Saved = {
  contractSumKobo?: string | null;
  stages?: SavedStage[];
  items?: SavedItem[];
  koboPerUsdc?: string;
  issues?: Issue[];
  source?: string;
};

export type ReviewRow = {
  code: string;
  field: string;
  value: string;
  severity: string;
  anchor: string | null;
  quote: string | null;
  kept: boolean;
  stageIndex: number | null;
};

export type ReviewPayload = {
  empty: false;
  contractSumLabel: string;
  stageTotalLabel: string;
  stageCountLabel: string;
  match: boolean;
  source: string;
  items: { label: string }[];
  issues: ReviewRow[];
};

function asSaved(value: unknown): Saved | null {
  if (!value || typeof value !== "object") return null;
  return value as Saved;
}

function stageTotal(stages: SavedStage[]): bigint {
  let total = 0n;
  for (const stage of stages) total += BigInt(stage.amountKobo);
  return total;
}

function rowsFrom(issues: Issue[]): ReviewRow[] {
  return issues.map((issue) => ({
    code: issue.code,
    field: issue.field ?? issue.rule,
    value: issue.value ?? issue.message,
    severity: issue.severity,
    anchor: issue.anchor,
    quote: issue.quote ?? issue.message,
    kept: issue.kept === true,
    stageIndex: issue.stageIndex ?? null,
  }));
}

function payload(saved: Saved): ReviewPayload {
  const stages = saved.stages ?? [];
  const contract = saved.contractSumKobo ? BigInt(saved.contractSumKobo) : null;
  const total = stageTotal(stages);
  const items = (saved.items ?? []).map((item, index) => ({
    label: `${index + 1}. ${item.description || item.itemRef || "Item"} — ${formatNaira(BigInt(item.amountKobo ?? "0"))}`,
  }));
  return {
    empty: false,
    contractSumLabel: contract === null ? "Not found" : formatNaira(contract),
    stageTotalLabel: formatNaira(total),
    stageCountLabel: stageCountPhrase(stages.length),
    match: contract !== null && contract === total,
    source: saved.source ?? "parser",
    items,
    issues: rowsFrom(saved.issues ?? []),
  };
}

export async function loadReview(db: Database, projectId: string): Promise<ReviewPayload | null> {
  const extraction = (await db.select().from(extractions).where(eq(extractions.projectId, projectId)).orderBy(desc(extractions.createdAt)))[0];
  const saved = asSaved(extraction?.validatedJson);
  if (!extraction || !saved) return null;
  return payload(saved);
}

function refreshSum(saved: Saved): void {
  const stages = saved.stages ?? [];
  const contract = saved.contractSumKobo ? BigInt(saved.contractSumKobo) : null;
  const total = stageTotal(stages);
  const issues = (saved.issues ?? []).filter((issue) => issue.code !== "V07");
  if (contract !== null && stages.length > 0 && total !== contract) {
    const difference = total > contract ? total - contract : contract - total;
    issues.push({
      code: "V07",
      rule: "stages_sum",
      severity: "blocking",
      message: `Stages add up to ${formatNaira(total)}, but the contract sum is ${formatNaira(contract)} — a difference of ${formatNaira(difference)}.`,
      anchor: null,
      field: "Stage total",
      value: formatNaira(total),
      stageIndex: stages.length,
    });
  }
  saved.issues = issues;
}

export async function reviewAction(
  db: Database,
  input: { projectId: string; action: "correct" | "keep"; code?: string; anchor?: string | null; stageIndex?: number | null; value?: string },
): Promise<{ ok: true; review: ReviewPayload } | { ok: false; message: string }> {
  const extraction = (await db.select().from(extractions).where(eq(extractions.projectId, input.projectId)).orderBy(desc(extractions.createdAt)))[0];
  const saved = asSaved(extraction?.validatedJson);
  if (!extraction || !saved) return { ok: false, message: "There are no figures to review yet." };
  const issues = saved.issues ?? [];
  if (input.action === "keep") {
    const match = issues.find((issue) => issue.code === input.code && issue.anchor === (input.anchor ?? null));
    const target = match ?? issues.find((issue) => issue.code === input.code);
    if (!target) return { ok: false, message: "That item is not on the review." };
    target.kept = true;
  } else {
    const amount = moneyKobo(input.value ?? "");
    if (amount === null) return { ok: false, message: "Write the amount as naira with two decimals, for example 1000.00." };
    const stages = saved.stages ?? [];
    const index = (input.stageIndex ?? 0) - 1;
    const stage = stages[index] ?? stages[0];
    if (!stage) return { ok: false, message: "There is no stage to correct." };
    stage.amountKobo = amount.toString();
    const rate = BigInt(saved.koboPerUsdc ?? "1");
    stage.amountMicro = koboToMicro(amount, rate > 0n ? rate : 1n).toString();
    const issue = issues.find((row) => row.code === input.code && row.anchor === (input.anchor ?? null)) ?? issues.find((row) => row.code === input.code);
    if (issue) {
      issue.value = formatNaira(amount);
      issue.kept = false;
    }
  }
  refreshSum(saved);
  await db.update(extractions).set({ validatedJson: saved, issues: saved.issues ?? [] }).where(eq(extractions.id, extraction.id));
  return { ok: true, review: payload(saved) };
}
