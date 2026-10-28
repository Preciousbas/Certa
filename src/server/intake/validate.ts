import { allocateMicro } from "../../lib/money/fx.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { applyBps } from "../../lib/money/percent.js";
import { absDiff, digits, formatQty, grossUp, itemAmount, mulDivRound, pctFromBps } from "./amounts.js";
import { billGap, worstItem, type BoqDraft, type DraftBill, type DraftItem } from "./interpret.js";

export type Severity = "blocking" | "warning" | "info";
export type Issue = {
  code: string;
  rule: string;
  severity: Severity;
  message: string;
  anchor: string | null;
  quote?: string | null;
  field?: string;
  value?: string;
  kept?: boolean;
  stageIndex?: number | null;
};
export type StageTag = "concrete_pour" | "reinforcement" | "blockwork" | "roofing" | "plastering" | "tiling" | "electrical" | "plumbing" | "external";
export type StageKind = "mobilisation" | "work" | "reserve";

export type StagePlan = {
  number: number;
  name: string;
  kind: StageKind;
  billRefs: string[];
  netKobo: bigint;
  amountKobo: bigint;
  amountMicro: bigint;
  acceptanceCriteria: string[];
  tags: StageTag[];
  expectedFinish: string | null;
  itemIds: string[];
  boqKobo: bigint | null;
  source: "document" | "model";
};

export type ValidatedPlan = {
  issues: Issue[];
  stages: StagePlan[];
  basis: "boq_grouping" | "contract_milestones";
  currency: "NGN" | "USD";
  statedContractSumKobo: bigint | null;
  computedContractSumKobo: bigint | null;
  contractSumKobo: bigint | null;
  vatBps: number;
  vatKobo: bigint;
  retentionBps: number;
  durationWeeks: number | null;
  defectsMonths: number;
  defectsPeriodDays: number;
  advanceKobo: bigint;
  spendingCapMicro: bigint;
  koboPerUsdc: bigint;
  netKobo: bigint;
  derived: boolean;
};

const TOLERANCE = 100n;

type Recipe = { order: number; name: string; kind: "mobilisation" | "work"; tags: StageTag[]; criteria: string[]; test: RegExp };

const RECIPES: Recipe[] = [
  { order: 1, test: /prelim/i, name: "Mobilisation & site set-up", kind: "mobilisation", tags: ["external"], criteria: ["Site hoarding and a vehicle gate are standing around the plot", "Setting-out pegs mark the building outline on the stripped ground", "A site store or office is in place inside the hoarding"] },
  { order: 2, test: /substructure|foundation|excav/i, name: "Substructure", kind: "work", tags: ["concrete_pour", "blockwork"], criteria: ["Foundation trenches are excavated and the blinding concrete is visible", "Strip footing concrete is cast and the top surface is exposed", "Blockwork is built up to the damp-proof course and filled solid"] },
  { order: 3, test: /ground floor/i, name: "Ground floor frame & blockwork", kind: "work", tags: ["concrete_pour", "reinforcement", "blockwork"], criteria: ["Column and beam reinforcement is tied and fixed in place", "Formwork to columns and beams is erected and braced", "Concrete in the ground floor frame is cast and the formwork is struck"] },
  { order: 4, test: /upper floor|first floor/i, name: "Upper floor", kind: "work", tags: ["concrete_pour", "blockwork"], criteria: ["The upper floor slab soffit is visible across the whole floor", "Upper floor columns are cast and standing on the slab", "Blockwork to the upper floor walls is built to the wall plate"] },
  { order: 5, test: /roof/i, name: "Roof", kind: "work", tags: ["roofing"], criteria: ["Roof carcass or trusses are fixed over the whole building", "Roof covering is laid with no open bays left", "Eaves and gutters are fixed along the roof edge"] },
  { order: 6, test: /finish/i, name: "Finishes", kind: "work", tags: ["plastering", "tiling"], criteria: ["Wall plaster is complete in the rooms on this stage", "Floor screed or tiles are laid across the rooms", "Doors and windows on this stage are hung and close"] },
  { order: 7, test: /electric|plumb|service/i, name: "Services", kind: "work", tags: ["electrical", "plumbing"], criteria: ["Electrical conduits and back boxes are fixed and visible", "Plumbing pipes are fixed and the ends are open for inspection", "The distribution board or water point for this stage is mounted"] },
  { order: 8, test: /external/i, name: "External works", kind: "work", tags: ["external"], criteria: ["External paving or the driveway base is visible", "The boundary or the soakaway excavation is open to view", "External drainage pipes are laid and the trench is visible"] },
];

const FALLBACK: Recipe = { order: 9, test: /.*/, name: "Measured work", kind: "work", tags: ["external"], criteria: ["The measured work for this stage is visible on site", "The area named in the stage is complete enough to photograph", "Materials for this stage are fixed, not only stacked"] };

function recipeFor(title: string): Recipe {
  const trimmed = title.trim();
  if (!trimmed || /^(boq|b\.o\.q\.?|bill of quantities|sheet\s*\d*)$/i.test(trimmed)) return FALLBACK;
  return RECIPES.find((recipe) => recipe.test.test(title)) ?? { ...FALLBACK, name: title.slice(0, 80) };
}

function matchingRecipe(title: string): Recipe | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return RECIPES.find((recipe) => recipe.test.test(title)) ?? null;
}

export function stageRecipe(name: string): { kind: StageKind; acceptanceCriteria: string[]; tags: StageTag[] } {
  const recipe = recipeFor(name);
  return { kind: /mobil/i.test(name) ? "mobilisation" : recipe.kind, acceptanceCriteria: recipe.criteria, tags: recipe.tags };
}

function itemId(item: DraftItem): string {
  return `${item.billRef}:${item.itemRef}:${item.line}`;
}

function pricedItems(bill: DraftBill): DraftItem[] {
  return bill.items.filter((item) => item.rowKind === "item" && item.statedKobo !== null);
}

function markerNumber(text: string): number | null {
  const match = /\b(?:stage|phase)\s*(\d+)\b/i.exec(text);
  return match?.[1] ? digits(match[1]) : null;
}

function stripMarker(text: string): string {
  return text.replace(/\s*\((?:stage|phase)\s*\d+\)\s*/gi, " ").replace(/\b(?:stage|phase)\s*\d+\b/gi, " ").replace(/\s+/g, " ").trim();
}

function keywords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
}

function overlapCount(left: string, right: string): number {
  const words = new Set(keywords(right));
  return keywords(left).filter((word) => words.has(word)).length;
}

type Built = Omit<StagePlan, "number" | "amountMicro">;

function stageFrom(input: Omit<Built, "expectedFinish" | "itemIds" | "boqKobo" | "source"> & Partial<Pick<Built, "expectedFinish" | "itemIds" | "boqKobo" | "source">>): Built {
  return { expectedFinish: null, itemIds: [], boqKobo: null, source: "document", ...input };
}

function markerStages(bill: DraftBill, items: DraftItem[]): Built[] {
  const numbers = [...new Set(items.map((item) => markerNumber(`${item.description} ${item.itemRef}`)).filter((value): value is number => value !== null))].sort((left, right) => left - right);
  const groups = new Map<number, DraftItem[]>(numbers.map((number) => [number, []]));
  let current = numbers[0] ?? 1;
  for (const item of items) {
    const marker = markerNumber(`${item.description} ${item.itemRef}`);
    if (marker !== null) current = marker;
    (groups.get(current) ?? groups.get(numbers[0] ?? current))?.push(item);
  }
  return numbers.map((number) => {
    const group = groups.get(number) ?? [];
    const amount = group.reduce((sum, item) => sum + (item.statedKobo ?? 0n), 0n);
    const joined = group.map((item) => stripMarker(item.description)).join(" ");
    const name = (group.length === 1 ? stripMarker(group[0]?.description ?? "") : matchingRecipe(joined)?.name ?? `Stage ${number}`) || `Stage ${number}`;
    const recipe = stageRecipe(name);
    return stageFrom({
      name: name.slice(0, 80),
      kind: recipe.kind,
      billRefs: [bill.billRef],
      netKobo: amount,
      amountKobo: amount,
      acceptanceCriteria: recipe.acceptanceCriteria,
      tags: recipe.tags,
      itemIds: group.map(itemId),
    });
  });
}

function recipeStages(items: DraftItem[]): Built[] | null {
  const buckets = new Map<string, { recipe: Recipe; items: DraftItem[] }>();
  let unmatched = 0;
  for (const item of items) {
    const recipe = matchingRecipe(`${item.description} ${item.itemRef}`);
    if (!recipe) {
      unmatched += 1;
      continue;
    }
    const bucket = buckets.get(recipe.name) ?? { recipe, items: [] };
    bucket.items.push(item);
    buckets.set(recipe.name, bucket);
  }
  const recipes = [...buckets.values()];
  const clear = recipes.filter((bucket) => bucket.items.length >= 2).length >= 2 || (unmatched === 0 && recipes.length >= 2);
  if (!clear || recipes.length < 2) return null;
  const ordered = recipes.sort((left, right) => left.recipe.order - right.recipe.order);
  const stages = ordered.map((bucket) => stageFrom({
    name: bucket.recipe.name,
    kind: bucket.recipe.kind,
    billRefs: [...new Set(bucket.items.map((item) => item.billRef))],
    netKobo: 0n,
    amountKobo: 0n,
    acceptanceCriteria: bucket.recipe.criteria,
    tags: bucket.recipe.tags,
  }));
  const byName = new Map(ordered.map((bucket, index) => [bucket.recipe.name, stages[index]!]));
  let current = stages[0] ?? null;
  for (const item of items) {
    const recipe = matchingRecipe(`${item.description} ${item.itemRef}`);
    const stage = (recipe ? byName.get(recipe.name) : null) ?? current;
    if (!stage) continue;
    current = stage;
    stage.itemIds.push(itemId(item));
    stage.amountKobo += item.statedKobo ?? 0n;
    stage.netKobo += item.statedKobo ?? 0n;
    if (!stage.billRefs.includes(item.billRef)) stage.billRefs.push(item.billRef);
  }
  return stages;
}

function stagesFromSingle(bill: DraftBill, issues: Issue[]): Built[] {
  const items = pricedItems(bill);
  if (items.some((item) => markerNumber(`${item.description} ${item.itemRef}`) !== null)) return markerStages(bill, items);
  const split = recipeStages(items);
  if (split && split.length >= 2) return split;
  const recipe = recipeFor(bill.title);
  const amount = billNet(bill);
  issues.push(issue("single_stage", "single_stage", "info", "Your file has one priced section, so Certa made 1 stage. You can split it into more stages on the Review page before you send it.", bill.anchor));
  return [stageFrom({
    name: recipe.name,
    kind: recipe.kind,
    billRefs: [bill.billRef],
    netKobo: amount,
    amountKobo: amount,
    acceptanceCriteria: recipe.criteria,
    tags: recipe.tags,
    itemIds: items.map(itemId),
  })];
}

function matchStage(label: string, stages: Built[]): Built | null {
  const work = stages.filter((stage) => stage.kind !== "reserve");
  const recipe = matchingRecipe(label);
  if (recipe) {
    const same = work.filter((stage) => matchingRecipe(stage.name)?.name === recipe.name);
    if (same.length === 1) return same[0] ?? null;
    if (same.length > 1) return same.slice().sort((left, right) => overlapCount(label, right.name) - overlapCount(label, left.name))[0] ?? null;
  }
  return work
    .map((stage) => ({ stage, score: overlapCount(label, stage.name) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.stage ?? null;
}

function linkBoq(stages: Built[], bills: DraftBill[], issues: Issue[]): void {
  const pricedBills = bills.filter((bill) => pricedItems(bill).length > 0);
  if (pricedBills.length === 0 || stages.length === 0) return;
  const units = pricedBills.length === 1
    ? pricedBills.flatMap((bill) => pricedItems(bill).map((item) => ({
      label: `${item.description} ${item.itemRef}`,
      amount: item.statedKobo ?? 0n,
      billRef: bill.billRef,
      ids: [itemId(item)],
    })))
    : pricedBills.map((bill) => ({
      label: bill.title,
      amount: billNet(bill),
      billRef: bill.billRef,
      ids: pricedItems(bill).map(itemId),
    }));
  const unlinked: string[] = [];
  for (const unit of units) {
    const stage = matchStage(unit.label, stages);
    if (!stage) {
      unlinked.push(unit.label.trim() || unit.billRef);
      continue;
    }
    stage.boqKobo = (stage.boqKobo ?? 0n) + unit.amount;
    if (!stage.billRefs.includes(unit.billRef)) stage.billRefs.push(unit.billRef);
    stage.itemIds.push(...unit.ids);
  }
  if (unlinked.length > 0) {
    issues.push(issue("unlinked", "unlinked", "info", `Not linked to a stage: ${unlinked.join("; ")}.`, null));
  }
}

function issue(code: string, rule: string, severity: Severity, message: string, anchor: string | null): Issue {
  return { code, rule, severity, message, anchor };
}

function billNet(bill: DraftBill): bigint {
  return bill.statedSubtotalKobo ?? bill.items.reduce((sum, item) => sum + (item.rowKind === "item" ? item.statedKobo ?? 0n : 0n), 0n);
}

function renumber(built: Omit<StagePlan, "number" | "amountMicro">[], rate: bigint): StagePlan[] {
  if (rate <= 0n) return built.map((stage, index) => ({ ...stage, number: index + 1, amountMicro: 0n }));
  const micros = allocateMicro(built.map((stage) => stage.amountKobo), rate);
  return built.map((stage, index) => ({ ...stage, number: index + 1, amountMicro: micros[index] ?? 0n }));
}

export function validateDraft(draft: BoqDraft, koboPerUsdc: bigint): ValidatedPlan {
  const issues: Issue[] = [];
  if (draft.currency !== "NGN") {
    issues.push(issue("V17", "currency", "blocking", "Certa can only price a contract in naira at the moment.", null));
  }
  for (const hit of draft.suspicious) {
    const where = hit.billRef ? `Bill ${hit.billRef}, row ${hit.row}` : `row ${hit.row}`;
    issues.push(issue("V16", "suspicious_instruction", "warning", `This document contains text that looks like an instruction to software (${where}). Certa ignored it. Please check the document is genuine.`, hit.anchor));
  }
  for (const bill of draft.bills) {
    for (const item of bill.items) {
      if (item.rowKind !== "item" || item.quantityMilli === null || item.rateKobo === null || item.statedKobo === null) continue;
      const computed = itemAmount(item.quantityMilli, item.rateKobo);
      const gap = absDiff(computed, item.statedKobo);
      if (gap > TOLERANCE) {
        issues.push(issue(
          "V01",
          "item_maths",
          "blocking",
          `Bill ${bill.billRef}, item ${item.itemRef}: ${formatQty(item.quantityMilli)} ${item.unit ?? ""} × ${formatNaira(item.rateKobo)} = ${formatNaira(computed)}, but the document says ${formatNaira(item.statedKobo)} (difference ${formatNaira(gap)}).`.replace("  ", " "),
          item.anchor,
        ));
      }
      if (item.confidence < 0.8) {
        issues.push(issue("V13", "low_confidence", "warning", `Bill ${bill.billRef}, item ${item.itemRef} is not clear enough to use without a check.`, item.anchor));
      }
    }
    const gap = billGap(bill);
    if (gap && absDiff(gap.statedSum, gap.subtotal) > TOLERANCE) {
      const cause = worstItem(bill);
      const causeText = cause ? ` Item ${cause.itemRef} looks like the cause.` : "";
      issues.push(issue(
        "V02",
        "bill_subtotal",
        "blocking",
        `Bill ${bill.billRef} items add up to ${formatNaira(gap.statedSum)}, but the bill total says ${formatNaira(gap.subtotal)} (difference ${formatNaira(absDiff(gap.statedSum, gap.subtotal))}).${causeText}`,
        bill.anchor,
      ));
    }
  }
  let billSum = 0n;
  for (const bill of draft.bills) billSum += billNet(bill);
  if (draft.statedGrandKobo !== null && absDiff(billSum, draft.statedGrandKobo) > TOLERANCE) {
    issues.push(issue("V03", "summary_total", "blocking", `The bills add up to ${formatNaira(billSum)}, but the summary says ${formatNaira(draft.statedGrandKobo)} (difference ${formatNaira(absDiff(billSum, draft.statedGrandKobo))}).`, null));
  }
  const provisional = draft.provisional.reduce((sum, row) => sum + row.kobo, 0n);
  const prime = draft.primeCost.reduce((sum, row) => sum + row.kobo, 0n);
  const contingency = draft.contingencyKobo ?? 0n;
  const net = (draft.statedGrandKobo ?? billSum) + provisional + prime + contingency;
  const vatBps = draft.vatBps ?? 0;
  const recomputedVat = vatBps > 0 ? applyBps(net, vatBps) : 0n;
  if (draft.vatKobo !== null && absDiff(recomputedVat, draft.vatKobo) > TOLERANCE) {
    issues.push(issue(
      "V05",
      "vat",
      "blocking",
      `VAT at ${pctFromBps(vatBps)}% of ${formatNaira(net)} is ${formatNaira(recomputedVat)}, but the document says ${formatNaira(draft.vatKobo)} (difference ${formatNaira(absDiff(recomputedVat, draft.vatKobo))}).`,
      draft.vatAnchor,
    ));
  }
  if (draft.contingencyKobo !== null && draft.contingencyBps !== null && draft.statedGrandKobo !== null) {
    const expected = applyBps(draft.statedGrandKobo, draft.contingencyBps);
    if (absDiff(expected, draft.contingencyKobo) > TOLERANCE) {
      issues.push(issue("V06", "contingency_pct", "warning", `Contingency at ${pctFromBps(draft.contingencyBps)}% would be ${formatNaira(expected)}, but the document says ${formatNaira(draft.contingencyKobo)}.`, draft.contingencyAnchor));
    }
  }
  const computed = draft.includesVat ? net + recomputedVat : net;
  const priced = draft.bills.some((bill) => pricedItems(bill).length > 0);
  if (priced && draft.contractSumKobo !== null) {
    const boqTotal = draft.milestones.length > 0 && draft.boqStatedKobo !== null ? draft.boqStatedKobo : computed;
    if (absDiff(boqTotal, draft.contractSumKobo) > TOLERANCE) {
      if (draft.milestones.length > 0) {
        const gap = absDiff(boqTotal, draft.contractSumKobo);
        issues.push(issue(
          "V19",
          "contract_boq_mismatch",
          "warning",
          `The BoQ adds up to ${formatNaira(boqTotal)} but the contract sum is ${formatNaira(draft.contractSumKobo)} (difference ${formatNaira(gap)}). Certa used the contract's payment schedule for the stages. Check this before you send the plan.`,
          draft.contractSumAnchor,
        ));
      } else if (absDiff(computed, draft.contractSumKobo) > TOLERANCE) {
        issues.push(issue(
          "V04",
          "contract_sum",
          "blocking",
          `The items, sums and correctly calculated VAT add up to ${formatNaira(computed)}, but the contract sum says ${formatNaira(draft.contractSumKobo)} (difference ${formatNaira(absDiff(computed, draft.contractSumKobo))}).`,
          draft.contractSumAnchor,
        ));
      }
    }
  }
  for (const line of draft.summaryChecks) {
    const number = /bill\s+(\d+)/i.exec(line.label)?.[1] ?? (/^(\d+)\b/.exec(line.label)?.[1] ?? null);
    const bill = (number ? draft.bills.find((item) => item.billRef === number) : null)
      ?? draft.bills.find((item) => item.title.length > 2 && line.label.toLowerCase().includes(item.title.toLowerCase()));
    if (!bill) continue;
    const netBill = billNet(bill);
    if (absDiff(netBill, line.kobo) > TOLERANCE) {
      issues.push(issue("V03", "summary_total", "blocking", `Bill ${bill.billRef} items add up to ${formatNaira(netBill)}, but the summary says ${formatNaira(line.kobo)} (difference ${formatNaira(absDiff(netBill, line.kobo))}).`, line.anchor));
    }
  }
  for (const note of draft.notices) {
    issues.push(issue("unheaded_row", "unheaded_row", "info", note.message, note.anchor));
  }
  const basis: ValidatedPlan["basis"] = draft.milestones.length > 0 ? "contract_milestones" : "boq_grouping";
  const target = draft.milestones.length > 0 ? (draft.contractSumKobo ?? (computed > 0n ? computed : null)) : (computed > 0n ? computed : draft.contractSumKobo);
  const built: Built[] = [];
  const liveBills = draft.bills.filter((bill) => bill.items.length > 0 || bill.statedSubtotalKobo !== null);
  if (basis === "boq_grouping") {
    if (liveBills.length === 1 && liveBills[0]) {
      built.push(...stagesFromSingle(liveBills[0], issues));
    } else {
      const grouped = new Map<string, { order: number; stage: Built }>();
      for (const bill of liveBills) {
        const recipe = recipeFor(bill.title);
        const existing = grouped.get(recipe.name);
        const netKobo = billNet(bill);
        const ids = pricedItems(bill).map(itemId);
        if (existing) {
          existing.stage.netKobo += netKobo;
          existing.stage.amountKobo += netKobo;
          existing.stage.billRefs.push(bill.billRef);
          existing.stage.itemIds.push(...ids);
        } else {
          grouped.set(recipe.name, {
            order: recipe.order,
            stage: stageFrom({ name: recipe.name, kind: recipe.kind, billRefs: [bill.billRef], netKobo, amountKobo: netKobo, acceptanceCriteria: recipe.criteria, tags: recipe.tags, itemIds: ids }),
          });
        }
      }
      built.push(...[...grouped.values()].sort((left, right) => left.order - right.order).map((entry) => entry.stage));
    }
    if (provisional + prime + contingency > 0n) {
      built.push(stageFrom({
        name: "Reserve: provisional sum + contingency (variations only)",
        kind: "reserve",
        billRefs: [],
        netKobo: provisional + prime + contingency,
        amountKobo: provisional + prime + contingency,
        acceptanceCriteria: ["A signed variation names the reserve item being spent", "The physical work for that variation is visible on site", "The variation amount is written on the sheet the client signed"],
        tags: ["external"],
      }));
    }
    if (draft.includesVat && vatBps > 0) {
      for (const stage of built) stage.amountKobo = grossUp(stage.netKobo, vatBps);
    }
  } else {
    draft.milestones.forEach((milestone, index) => {
      const name = (milestone.name || `Stage ${index + 1}`).trim().slice(0, 80) || `Stage ${index + 1}`;
      const fromPct = target !== null && milestone.pctBps !== null ? mulDivRound(target, BigInt(milestone.pctBps), 10_000n) : null;
      let amount = milestone.amountKobo ?? fromPct;
      if (amount === null) {
        amount = 0n;
        issues.push(issue("V21", "milestone_amount", "blocking", `Stage ${index + 1} (${name}) has no amount or percentage. Enter it on the Review page.`, milestone.anchor));
      } else if (milestone.amountKobo !== null && fromPct !== null && milestone.pctBps !== null && absDiff(milestone.amountKobo, fromPct) > TOLERANCE) {
        issues.push(issue("V22", "milestone_pct_amount", "warning", `Stage ${index + 1} (${name}) says ${formatNaira(milestone.amountKobo)} but ${pctFromBps(milestone.pctBps)}% of the contract sum is ${formatNaira(fromPct)}.`, milestone.anchor));
      }
      const recipe = stageRecipe(name);
      built.push(stageFrom({
        name,
        kind: recipe.kind,
        billRefs: [],
        netKobo: amount,
        amountKobo: amount,
        acceptanceCriteria: recipe.acceptanceCriteria,
        tags: recipe.tags,
        expectedFinish: milestone.dueDate,
        source: draft.scheduleSource,
      }));
    });
    linkBoq(built, liveBills, issues);
  }
  const foundStages = built.filter((stage) => stage.kind !== "reserve").length;
  if (draft.statedStageCount !== null && draft.statedStageCount !== foundStages) {
    issues.push(issue("V20", "stage_count", "warning", `The document says ${draft.statedStageCount} stages, but Certa found ${foundStages}. Check the stages on the Review page.`, null));
  }
  if (target !== null && built.length > 0) {
    let sum = 0n;
    for (const stage of built) sum += stage.amountKobo;
    const residual = target - sum;
    const room = 100n * BigInt(Math.max(1, foundStages));
    if (residual !== 0n && absDiff(residual, 0n) <= room) {
      const lastWork = [...built].reverse().find((stage) => stage.kind === "work") ?? built[built.length - 1];
      if (lastWork) lastWork.amountKobo += residual;
      issues.push(issue("V18", "rounding_adjustment", "info", `A rounding remainder of ${formatNaira(residual < 0n ? -residual : residual)} was added to the last work stage so the stages match the contract sum exactly.`, null));
    }
  }
  const stages = renumber(built, koboPerUsdc);
  for (const bill of draft.bills) {
    for (const item of bill.items) {
      const id = itemId(item);
      item.id = id;
      item.stageNumber = stages.find((stage) => stage.itemIds.includes(id))?.number ?? null;
    }
  }
  for (const stage of stages) {
    if (stage.boqKobo === null || stage.kind === "reserve") continue;
    if (absDiff(stage.boqKobo, stage.amountKobo) > TOLERANCE) {
      issues.push(issue("boq_stage_gap", "boq_stage_gap", "warning", `${stage.name}: the BoQ items add up to ${formatNaira(stage.boqKobo)} but this stage is ${formatNaira(stage.amountKobo)}.`, null));
    }
  }
  let stageSum = 0n;
  for (const stage of stages) stageSum += stage.amountKobo;
  if (target !== null && stages.length > 0 && stageSum !== target) {
    issues.push(issue("V07", "stages_sum", "blocking", `Stages add up to ${formatNaira(stageSum)}, but the contract sum is ${formatNaira(target)} — a difference of ${formatNaira(absDiff(stageSum, target))}.`, null));
  }
  if (draft.milestones.length > 0) {
    let pct = 0;
    let complete = true;
    for (const milestone of draft.milestones) {
      if (milestone.pctBps === null) complete = false;
      else pct += milestone.pctBps;
    }
    const anyPct = draft.milestones.some((milestone) => milestone.pctBps !== null);
    if (anyPct && (!complete || pct !== 10_000)) {
      issues.push(issue("V08", "milestone_pct", "blocking", `Milestone percentages add up to ${pctFromBps(pct)}%, and they must add up to 100%.`, draft.milestones[0]?.anchor ?? null));
    }
  }
  const retentionBps = draft.retentionBps ?? 0;
  if (draft.retentionBps !== null && (draft.retentionBps < 0 || draft.retentionBps > 1000)) {
    issues.push(issue("V09", "retention_range", "blocking", `Retention is ${pctFromBps(draft.retentionBps)}%. Certa keeps retention between 0% and 10%.`, null));
  }
  if (draft.retentionRelease && /half/i.test(draft.retentionRelease)) {
    issues.push(issue("retention_split_not_automated", "retention_split", "info", "The contract releases retention in two halves. Certa's escrow releases the whole retention once, after the defects period.", null));
  }
  const advance = draft.advanceKobo ?? 0n;
  const contractForAdvance = target ?? draft.contractSumKobo;
  if (draft.advanceBps !== null && draft.advanceBps > 3000) {
    issues.push(issue("V10", "advance", "warning", `The mobilisation advance is ${pctFromBps(draft.advanceBps)}%, which is above 30% of the contract sum.`, null));
  } else if (contractForAdvance && advance * 100n > contractForAdvance * 30n) {
    issues.push(issue("V10", "advance", "warning", "The mobilisation advance is above 30% of the contract sum.", null));
  }
  if ((draft.advanceBps !== null && draft.advanceBps > 0 || advance > 0n) && !draft.advanceRecovery) {
    issues.push(issue("V10", "advance", "warning", "The mobilisation advance has no recovery method.", null));
  }
  const defectsMonths = draft.defectsMonths ?? 6;
  let resolved = target;
  let derived = false;
  if (resolved === null && stageSum > 0n) {
    resolved = stageSum;
    derived = true;
    issues.push(issue("derived", "derived_sum", "info", "The contract sum was derived from the stage totals.", null));
  }
  if (!draft.clientName || !draft.contractorName || resolved === null || stages.length === 0) {
    issues.push(issue("V12", "missing_required", "blocking", "The contract sum, the client, the contractor, or the stages are missing.", null));
  }
  const seen = new Set<string>();
  for (const bill of draft.bills) {
    for (const item of bill.items) {
      if (item.rowKind !== "item" || item.statedKobo === null) continue;
      const key = `${bill.billRef}:${item.itemRef}:${item.statedKobo.toString()}`;
      if (seen.has(key)) issues.push(issue("V15", "duplicate_item", "warning", `Bill ${bill.billRef}, item ${item.itemRef} is listed twice with the same amount.`, item.anchor));
      seen.add(key);
    }
  }
  let largest = 0n;
  for (const stage of stages) {
    if (stage.kind !== "reserve" && stage.amountMicro > largest) largest = stage.amountMicro;
  }
  const cap = ((largest / 2n) / 1_000_000n) * 1_000_000n;
  return {
    issues,
    stages,
    basis,
    currency: draft.currency,
    statedContractSumKobo: draft.contractSumKobo,
    computedContractSumKobo: computed > 0n ? computed : null,
    contractSumKobo: resolved,
    vatBps,
    vatKobo: recomputedVat,
    retentionBps,
    durationWeeks: draft.durationWeeks,
    defectsMonths,
    defectsPeriodDays: defectsMonths * 30,
    advanceKobo: advance,
    spendingCapMicro: cap >= 1_000_000n ? cap : 1_000_000n,
    koboPerUsdc,
    netKobo: net,
    derived,
  };
}
