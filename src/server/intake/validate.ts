import { allocateMicro } from "../../lib/money/fx.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { applyBps } from "../../lib/money/percent.js";
import { absDiff, formatQty, grossUp, itemAmount, mulDivRound, pctFromBps } from "./amounts.js";
import { billGap, worstItem, type BoqDraft, type DraftBill } from "./interpret.js";

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
  return RECIPES.find((recipe) => recipe.test.test(title)) ?? { ...FALLBACK, name: title.slice(0, 80) };
}

function issue(code: string, rule: string, severity: Severity, message: string, anchor: string | null): Issue {
  return { code, rule, severity, message, anchor };
}

function billNet(bill: DraftBill): bigint {
  return bill.statedSubtotalKobo ?? bill.items.reduce((sum, item) => sum + (item.rowKind === "item" ? item.statedKobo ?? 0n : 0n), 0n);
}

function renumber(built: Omit<StagePlan, "number" | "amountMicro">[], rate: bigint): StagePlan[] {
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
  if (draft.contractSumKobo !== null && absDiff(computed, draft.contractSumKobo) > TOLERANCE) {
    issues.push(issue(
      "V04",
      "contract_sum",
      "blocking",
      `The items, sums and correctly calculated VAT add up to ${formatNaira(computed)}, but the contract sum says ${formatNaira(draft.contractSumKobo)} (difference ${formatNaira(absDiff(computed, draft.contractSumKobo))}).`,
      draft.contractSumAnchor,
    ));
  }
  const basis: ValidatedPlan["basis"] = draft.bills.length > 0 ? "boq_grouping" : "contract_milestones";
  const target = computed > 0n ? computed : draft.contractSumKobo;
  const built: Omit<StagePlan, "number" | "amountMicro">[] = [];
  if (basis === "boq_grouping") {
    const grouped = new Map<string, { order: number; stage: Omit<StagePlan, "number" | "amountMicro"> }>();
    for (const bill of draft.bills) {
      const recipe = recipeFor(bill.title);
      const existing = grouped.get(recipe.name);
      const netKobo = billNet(bill);
      if (existing) {
        existing.stage.netKobo += netKobo;
        existing.stage.billRefs.push(bill.billRef);
      } else {
        grouped.set(recipe.name, {
          order: recipe.order,
          stage: { name: recipe.name, kind: recipe.kind, billRefs: [bill.billRef], netKobo, amountKobo: netKobo, acceptanceCriteria: recipe.criteria, tags: recipe.tags },
        });
      }
    }
    const ordered = [...grouped.values()].sort((a, b) => a.order - b.order).map((entry) => entry.stage);
    built.push(...ordered);
    if (provisional + prime + contingency > 0n) {
      const reserveName = provisional > 0n && contingency > 0n && prime === 0n
        ? "Reserve: provisional sum + contingency (variations only)"
        : "Reserve: provisional sum + contingency (variations only)";
      built.push({
        name: reserveName,
        kind: "reserve",
        billRefs: [],
        netKobo: provisional + prime + contingency,
        amountKobo: provisional + prime + contingency,
        acceptanceCriteria: ["A signed variation names the reserve item being spent", "The physical work for that variation is visible on site", "The variation amount is written on the sheet the client signed"],
        tags: ["external"],
      });
    }
    if (draft.includesVat && vatBps > 0) {
      for (const stage of built) stage.amountKobo = grossUp(stage.netKobo, vatBps);
    }
  } else if (draft.milestones.length > 0) {
    for (const milestone of draft.milestones) {
      const amount = milestone.amountKobo ?? (target !== null && milestone.pctBps !== null ? mulDivRound(target, BigInt(milestone.pctBps), 10_000n) : null);
      if (amount === null) continue;
      const recipe = recipeFor(milestone.name);
      built.push({
        name: milestone.name,
        kind: /mobil/i.test(milestone.name) ? "mobilisation" : "work",
        billRefs: [],
        netKobo: amount,
        amountKobo: amount,
        acceptanceCriteria: recipe.criteria,
        tags: recipe.tags,
      });
    }
  }
  if (target !== null && built.length > 0) {
    let sum = 0n;
    for (const stage of built) sum += stage.amountKobo;
    const residual = target - sum;
    if (residual !== 0n) {
      const lastWork = [...built].reverse().find((stage) => stage.kind === "work") ?? built[built.length - 1];
      if (lastWork) lastWork.amountKobo += residual;
      issues.push(issue("V18", "rounding_adjustment", "info", `A rounding remainder of ${formatNaira(residual < 0n ? -residual : residual)} was added to the last work stage so the stages match the contract sum exactly.`, null));
    }
  }
  const stages = renumber(built, koboPerUsdc);
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
    if (!complete || pct !== 10_000) {
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
