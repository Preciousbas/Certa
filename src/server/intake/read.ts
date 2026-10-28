import { formatNgnFromKobo } from "@certa/shared";
import { citationHolds } from "./citations.js";
import { bpsFromPct, cellMoney, mulDivRound } from "./amounts.js";
import { interpretGrid, type BoqDraft, type DraftMilestone, type GridRow } from "./interpret.js";
import { ContractExtraction } from "../../lib/validation/contractExtraction.js";
import { parseBytes } from "./parse.js";
import { validateDraft, type ValidatedPlan } from "./validate.js";

export type ReadFile = { name: string; bytes: Uint8Array };

export type PlanOptions = {
  modelText?: string | null;
  chunks?: { content: string }[];
};

function isGroups(rows: GridRow[] | GridRow[][]): rows is GridRow[][] {
  return rows.length > 0 && Array.isArray(rows[0]);
}

function priced(draft: BoqDraft): boolean {
  return draft.bills.some((bill) => bill.items.some((item) => item.rowKind === "item" && item.statedKobo !== null));
}

function fillFrom(target: BoqDraft, extra: BoqDraft): void {
  target.clientName ??= extra.clientName;
  target.contractorName ??= extra.contractorName;
  target.consultantName ??= extra.consultantName;
  target.projectName ??= extra.projectName;
  target.location ??= extra.location;
  target.retentionBps ??= extra.retentionBps;
  target.defectsMonths ??= extra.defectsMonths;
  target.durationWeeks ??= extra.durationWeeks;
  target.statedStageCount ??= extra.statedStageCount;
  target.provisional.push(...extra.provisional);
  target.primeCost.push(...extra.primeCost);
  if (target.contingencyKobo === null) target.contingencyKobo = extra.contingencyKobo;
  target.notices.push(...extra.notices);
  target.summaryChecks.push(...extra.summaryChecks);
}

function boqSum(drafts: BoqDraft[]): bigint | null {
  const sums = drafts.map((draft) => draft.contractSumKobo).filter((value): value is bigint => value !== null);
  if (sums.length === 0) return null;
  return sums.reduce((sum, value) => sum + value, 0n);
}

export function combineDrafts(groups: GridRow[][], options?: PlanOptions): BoqDraft {
  const drafts = (groups.length > 0 ? groups : [[]]).map((rows) => interpretGrid(rows));
  const schedules = drafts.filter((draft) => draft.milestones.length > 0);
  const boqs = drafts.filter((draft) => priced(draft));
  let merged = drafts[0] ?? interpretGrid([]);
  if (schedules.length > 0) {
    merged = schedules[0] ?? merged;
    const extras = boqs.filter((draft) => draft !== merged);
    if (extras.length > 0) {
      merged.bills = [...merged.bills, ...extras.flatMap((draft) => draft.bills)];
      merged.boqStatedKobo = boqSum(extras);
      for (const extra of extras) fillFrom(merged, extra);
    }
  } else if (drafts.length > 1) {
    merged = interpretGrid(groups.flat());
  }
  if (merged.milestones.length === 0 && !priced(merged) && options?.modelText) {
    const applied = scheduleFromModel(options.modelText, options.chunks ?? []);
    if (applied) {
      merged.milestones = applied.milestones;
      if (applied.contractSumKobo !== null) merged.contractSumKobo = applied.contractSumKobo;
      if (applied.retentionBps !== null) merged.retentionBps = applied.retentionBps;
      if (applied.defectsMonths !== null) merged.defectsMonths = applied.defectsMonths;
      merged.scheduleSource = "model";
      if (applied.contractSumQuote) {
        merged.contractSumQuote = applied.contractSumQuote;
        merged.contractSumAnchor = applied.contractSumAnchor;
      }
    }
  }
  return merged;
}

export function planFromRows(rows: GridRow[] | GridRow[][], koboPerUsdc: bigint, options?: PlanOptions): { draft: BoqDraft; plan: ValidatedPlan } {
  const groups = isGroups(rows) ? rows : [rows];
  const draft = combineDrafts(groups, options);
  return { draft, plan: validateDraft(draft, koboPerUsdc) };
}

export function scheduleFromModel(
  text: string,
  chunks: { content: string }[],
): { milestones: DraftMilestone[]; contractSumKobo: bigint | null; retentionBps: number | null; defectsMonths: number | null; contractSumQuote: string | null; contractSumAnchor: string | null } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = ContractExtraction.safeParse(json);
  if (!parsed.success) return null;
  const milestones = parsed.data.payment_terms.milestones;
  if (milestones.length === 0) return null;
  if (!milestones.every((milestone) => chunks.some((chunk) => citationHolds(milestone.source.quote, chunk.content, null)))) return null;
  const sumRaw = parsed.data.sums.contract_sum.value;
  const contractSumKobo = sumRaw ? cellMoney(sumRaw) : null;
  const built = milestones.map((milestone) => {
    const pctBps = milestone.pct ? bpsFromPct(milestone.pct) : null;
    const amountKobo = contractSumKobo !== null && pctBps !== null ? mulDivRound(contractSumKobo, BigInt(pctBps), 10_000n) : null;
    return {
      name: milestone.name,
      pctBps,
      amountKobo,
      dueDate: null,
      anchor: milestone.source.anchor,
      quote: milestone.source.quote,
    };
  });
  const retention = parsed.data.payment_terms.retention_pct.value;
  return {
    milestones: built,
    contractSumKobo,
    retentionBps: retention ? bpsFromPct(retention) : null,
    defectsMonths: parsed.data.project.defects_liability_months.value,
    contractSumQuote: sumRaw,
    contractSumAnchor: parsed.data.sums.contract_sum.source?.anchor ?? null,
  };
}

export async function readDocuments(files: ReadFile[], koboPerUsdc: bigint, options?: PlanOptions): Promise<{ draft: BoqDraft; plan: ValidatedPlan }> {
  const groups: GridRow[][] = [];
  const chunks = [...(options?.chunks ?? [])];
  for (const file of files) {
    const parsed = await parseBytes(file.name, file.bytes);
    if (!parsed.ok) continue;
    groups.push(parsed.document.rows);
    for (const chunk of parsed.document.chunks) chunks.push({ content: chunk.content });
  }
  return planFromRows(groups.length > 0 ? groups : [[]], koboPerUsdc, { ...options, chunks });
}

export async function buildPreview(name: string, bytes: Uint8Array): Promise<
  | { contractSum: string; stages: { number: number; name: string; amount: string; criteria: string; expectedFinish: string | null }[]; issues: string[] }
  | { error: string }
> {
  const { plan } = await readDocuments([{ name, bytes }], 150_000n);
  const work = plan.stages.filter((stage) => stage.kind !== "reserve");
  if (plan.contractSumKobo === null || work.length === 0) {
    return { error: "No bill table was found. The sheet needs item, description, quantity, rate, and amount." };
  }
  return {
    contractSum: formatNgnFromKobo(plan.contractSumKobo),
    stages: work.map((stage) => ({
      number: stage.number,
      name: stage.name,
      amount: formatNgnFromKobo(stage.amountKobo),
      criteria: stage.acceptanceCriteria.join(" "),
      expectedFinish: stage.expectedFinish,
    })),
    issues: plan.issues.map((issue) => issue.message),
  };
}
