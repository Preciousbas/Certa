import { contractVersions, extractions, projects, type Database } from "@certa/db";
import { desc, eq } from "drizzle-orm";
import { moneyKobo } from "./amounts.js";
import { addStage, mergeWithNext, moveItem, removeStage, renameStage, setStageFinish, type EditError } from "./edits.js";
import { stageCountPhrase } from "./messages.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { koboToMicro } from "../../lib/money/fx.js";
import type { Issue, StagePlan } from "./validate.js";

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
  expectedFinish?: string | null;
  itemIds?: string[];
  boqKobo?: string | null;
  source?: "document" | "model";
};

type SavedItem = { id?: string; billRef?: string; itemRef?: string; description?: string; amountKobo?: string; stageNumber?: number | null; line?: number };

type Saved = {
  contractSumKobo?: string | null;
  basis?: string;
  stages?: SavedStage[];
  items?: SavedItem[];
  koboPerUsdc?: string;
  issues?: Issue[];
  source?: string;
};

export type ReviewStage = {
  number: number;
  name: string;
  amountLabel: string;
  itemCount: number;
  items: { id: string; label: string }[];
  expectedFinish: string | null;
  kind: string;
  source: string;
  boqLabel?: string;
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
  basis: string;
  locked: boolean;
  canEdit: boolean;
  items: { label: string }[];
  stages: ReviewStage[];
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

function payload(saved: Saved, role: string | null, locked: boolean): ReviewPayload {
  const stages = saved.stages ?? [];
  const contract = saved.contractSumKobo ? BigInt(saved.contractSumKobo) : null;
  const total = stageTotal(stages);
  const payable = stages.filter((stage) => stage.kind !== "reserve");
  const items = (saved.items ?? []).map((item, index) => ({
    label: `${index + 1}. ${item.description || item.itemRef || "Item"} — ${formatNaira(BigInt(item.amountKobo ?? "0"))}`,
  }));
  return {
    empty: false,
    contractSumLabel: contract === null ? "Not found" : formatNaira(contract),
    stageTotalLabel: formatNaira(total),
    stageCountLabel: stageCountPhrase(payable.length),
    match: contract !== null && contract === total,
    source: saved.source ?? "parser",
    basis: saved.basis ?? "boq_grouping",
    locked,
    canEdit: role === "client" && !locked,
    items,
    stages: stages.map((stage, index) => stageCard(saved, stage, index)),
    issues: rowsFrom(saved.issues ?? []),
  };
}

function stageCard(saved: Saved, stage: SavedStage, index: number): ReviewStage {
  const number = stage.number ?? index + 1;
  const linked = (saved.items ?? []).filter((item) => (item.id && stage.itemIds?.includes(item.id)) || item.stageNumber === number);
  const boq = stage.boqKobo ? BigInt(stage.boqKobo) : null;
  const amount = BigInt(stage.amountKobo);
  return {
    number,
    name: stage.name,
    amountLabel: formatNaira(amount),
    itemCount: linked.length,
    items: linked.map((item) => ({
      id: item.id ?? `${stage.billRefs[0] ?? "BOQ"}:${item.itemRef ?? "item"}:${item.line ?? index}`,
      label: `${item.description || item.itemRef || "Item"} — ${formatNaira(BigInt(item.amountKobo ?? "0"))}`,
    })),
    expectedFinish: stage.expectedFinish ?? null,
    kind: stage.kind,
    source: stage.source ?? "document",
    ...(boq !== null && boq !== amount ? { boqLabel: formatNaira(boq) } : {}),
  };
}

async function planLock(db: Database, projectId: string): Promise<boolean> {
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project?.currentContractVersionId) return false;
  const current = (await db.select().from(contractVersions).where(eq(contractVersions.id, project.currentContractVersionId)))[0];
  return current?.status === "accepted";
}

export async function loadReview(db: Database, projectId: string, role?: string | null): Promise<ReviewPayload | null> {
  const extraction = (await db.select().from(extractions).where(eq(extractions.projectId, projectId)).orderBy(desc(extractions.createdAt)))[0];
  const saved = asSaved(extraction?.validatedJson);
  if (!extraction || !saved) return null;
  return payload(saved, role ?? null, await planLock(db, projectId));
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
  input: { projectId: string; action: "correct" | "keep"; code?: string; anchor?: string | null; stageIndex?: number | null; value?: string; role?: string | null },
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
  return { ok: true, review: payload(saved, input.role ?? null, await planLock(db, input.projectId)) };
}

export type StageEdit = {
  op: "rename" | "add" | "move_item" | "merge" | "remove" | "set_finish";
  number?: number;
  name?: string;
  amount?: string;
  itemId?: string;
  toNumber?: number;
  into?: number | null;
  date?: string | null;
};

function toPlan(stage: SavedStage, index: number): StagePlan {
  return {
    number: stage.number ?? index + 1,
    name: stage.name,
    kind: stage.kind === "mobilisation" || stage.kind === "reserve" ? stage.kind : "work",
    netKobo: BigInt(stage.netKobo ?? stage.amountKobo),
    amountKobo: BigInt(stage.amountKobo),
    amountMicro: BigInt(stage.amountMicro),
    acceptanceCriteria: stage.acceptanceCriteria ?? [],
    tags: (stage.tags ?? []) as StagePlan["tags"],
    billRefs: stage.billRefs ?? [],
    expectedFinish: stage.expectedFinish ?? null,
    itemIds: stage.itemIds ?? [],
    boqKobo: stage.boqKobo ? BigInt(stage.boqKobo) : null,
    source: stage.source ?? "document",
  };
}

function writeStages(saved: Saved, stages: StagePlan[]): void {
  saved.stages = stages.map((stage) => ({
    number: stage.number,
    name: stage.name,
    kind: stage.kind,
    netKobo: stage.netKobo.toString(),
    amountKobo: stage.amountKobo.toString(),
    amountMicro: stage.amountMicro.toString(),
    acceptanceCriteria: stage.acceptanceCriteria,
    tags: stage.tags,
    billRefs: stage.billRefs,
    expectedFinish: stage.expectedFinish,
    itemIds: stage.itemIds,
    boqKobo: stage.boqKobo === null ? null : stage.boqKobo.toString(),
    source: stage.source,
  }));
  const owners = new Map<string, number>();
  for (const stage of stages) for (const id of stage.itemIds) owners.set(id, stage.number);
  for (const item of saved.items ?? []) {
    if (item.id && owners.has(item.id)) item.stageNumber = owners.get(item.id) ?? null;
  }
}

function applyEdit(saved: Saved, edit: StageEdit, rate: bigint): StagePlan[] | EditError {
  const stages = (saved.stages ?? []).map(toPlan);
  const basis = saved.basis ?? "boq_grouping";
  if (edit.op === "rename") return renameStage(stages, edit.number ?? 0, edit.name ?? "");
  if (edit.op === "set_finish") return setStageFinish(stages, edit.number ?? 0, edit.date ?? null);
  if (edit.op === "merge") return mergeWithNext(stages, edit.number ?? 0, rate);
  if (edit.op === "remove") return removeStage(stages, edit.number ?? 0, edit.into ?? null, rate);
  if (edit.op === "add") {
    const amount = basis === "contract_milestones" ? moneyKobo(edit.amount ?? "") : null;
    if (basis === "contract_milestones" && amount === null) return { error: "Write the amount as naira with two decimals, for example 1000.00." };
    return addStage(stages, { name: edit.name ?? "", basis, amountKobo: amount ?? undefined }, rate);
  }
  if (basis !== "boq_grouping") return { error: "Contract stages keep the schedule amounts. Split a stage instead of moving an item." };
  const item = (saved.items ?? []).find((row) => row.id === edit.itemId);
  if (!item?.id) return { error: "That item is not on a stage." };
  return moveItem(stages, { id: item.id, amountKobo: BigInt(item.amountKobo ?? "0") }, edit.toNumber ?? 0, rate);
}

export async function editStages(
  db: Database,
  input: { projectId: string; edit: StageEdit },
): Promise<{ ok: true; review: ReviewPayload; message: string } | { ok: false; message: string }> {
  if (await planLock(db, input.projectId)) {
    return { ok: false, message: "This plan is agreed. Propose a change instead — both sides must accept it." };
  }
  const extraction = (await db.select().from(extractions).where(eq(extractions.projectId, input.projectId)).orderBy(desc(extractions.createdAt)))[0];
  const saved = asSaved(extraction?.validatedJson);
  if (!extraction || !saved?.stages?.length) return { ok: false, message: "There are no figures to review yet." };
  const latest = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId)).orderBy(desc(contractVersions.version)))[0];
  let message = "Saved.";
  if (latest?.status === "pending_acceptance") {
    await db.update(contractVersions).set({ status: "draft" }).where(eq(contractVersions.id, latest.id));
    await db.update(projects).set({ status: "draft" }).where(eq(projects.id, input.projectId));
    message = "You changed the plan after sending it. Tap Send to contractor for agreement again.";
  }
  const rate = BigInt(saved.koboPerUsdc ?? "1");
  const edited = applyEdit(saved, input.edit, rate > 0n ? rate : 1n);
  if ("error" in edited) return { ok: false, message: edited.error };
  writeStages(saved, edited);
  refreshSum(saved);
  await db.update(extractions).set({ validatedJson: saved, issues: saved.issues ?? [] }).where(eq(extractions.id, extraction.id));
  return { ok: true, review: payload(saved, "client", false), message };
}
