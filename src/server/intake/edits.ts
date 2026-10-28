import { allocateMicro } from "../../lib/money/fx.js";
import { stageRecipe, type StagePlan } from "./validate.js";

export type EditError = { error: string };

function reprice(stages: StagePlan[], rate: bigint): StagePlan[] {
  const micros = allocateMicro(stages.map((stage) => stage.amountKobo), rate);
  return stages.map((stage, index) => ({ ...stage, number: index + 1, amountMicro: micros[index] ?? 0n }));
}

function isError(value: StagePlan[] | EditError): value is EditError {
  return "error" in value;
}

function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function unionText(left: string[], right: string[], cap: number): string[] {
  const out: string[] = [];
  for (const item of [...left, ...right]) {
    if (out.includes(item)) continue;
    out.push(item);
    if (out.length === cap) break;
  }
  return out;
}

function reserveError(stage: StagePlan | undefined): EditError | null {
  if (stage?.kind === "reserve") return { error: "The reserve can't be edited." };
  return null;
}

export function stageTotal(stages: StagePlan[]): bigint {
  return stages.reduce((sum, stage) => sum + stage.amountKobo, 0n);
}

export function splitStage(stages: StagePlan[], number: number, amountKobo: bigint, rate: bigint): StagePlan[] | EditError {
  const index = stages.findIndex((stage) => stage.number === number);
  const current = stages[index];
  const blocked = reserveError(current);
  if (blocked) return blocked;
  if (!current || amountKobo <= 0n || amountKobo >= current.amountKobo) return { error: "Both parts of a split must be more than zero." };
  const next = stages.slice();
  const left = { ...current, amountKobo, netKobo: amountKobo };
  const right = { ...current, name: `${current.name} (continued)`, amountKobo: current.amountKobo - amountKobo, netKobo: current.amountKobo - amountKobo };
  next.splice(index, 1, left, right);
  return reprice(next, rate);
}

export function mergeWithNext(stages: StagePlan[], number: number, rate: bigint): StagePlan[] | EditError {
  const index = stages.findIndex((stage) => stage.number === number);
  const current = stages[index];
  const following = stages[index + 1];
  const blocked = reserveError(current) ?? reserveError(following);
  if (blocked) return blocked;
  if (!current || !following) return { error: "There is no next stage to merge." };
  const next = stages.slice();
  next.splice(index, 2, {
    ...current,
    amountKobo: current.amountKobo + following.amountKobo,
    netKobo: current.netKobo + following.netKobo,
    billRefs: [...new Set([...current.billRefs, ...following.billRefs])],
    itemIds: [...current.itemIds, ...following.itemIds],
    acceptanceCriteria: unionText(current.acceptanceCriteria, following.acceptanceCriteria, 6),
    tags: [...new Set([...current.tags, ...following.tags])],
    expectedFinish: current.expectedFinish ?? following.expectedFinish,
    boqKobo: current.boqKobo === null && following.boqKobo === null ? null : (current.boqKobo ?? 0n) + (following.boqKobo ?? 0n),
  });
  return reprice(next, rate);
}

export function reamount(stages: StagePlan[], number: number, amountKobo: bigint, rate: bigint): StagePlan[] | EditError {
  const index = stages.findIndex((stage) => stage.number === number);
  const current = stages[index];
  const blocked = reserveError(current);
  if (blocked) return blocked;
  if (!current || amountKobo <= 0n) return { error: "A stage amount has to be more than zero." };
  const other = [...stages].reverse().find((stage) => stage.number !== number);
  if (!other) return { error: "There is no other stage to keep the total exact." };
  const delta = amountKobo - current.amountKobo;
  if (other.amountKobo - delta <= 0n) return { error: "That change would empty another stage." };
  return reprice(stages.map((stage) => {
    if (stage.number === number) return { ...stage, amountKobo, netKobo: amountKobo };
    if (stage.number === other.number) return { ...stage, amountKobo: stage.amountKobo - delta, netKobo: stage.netKobo - delta };
    return stage;
  }), rate);
}

export function renameStage(stages: StagePlan[], number: number, name: string): StagePlan[] | EditError {
  const trimmed = name.trim();
  const current = stages.find((stage) => stage.number === number);
  const blocked = reserveError(current);
  if (blocked) return blocked;
  if (!current) return { error: "That stage is not on the plan." };
  if (trimmed.length < 1 || trimmed.length > 80) return { error: "A stage name needs 1 to 80 characters." };
  return stages.map((stage) => (stage.number === number ? { ...stage, name: trimmed } : stage));
}

export function setStageFinish(stages: StagePlan[], number: number, date: string | null): StagePlan[] | EditError {
  const current = stages.find((stage) => stage.number === number);
  const blocked = reserveError(current);
  if (blocked) return blocked;
  if (!current) return { error: "That stage is not on the plan." };
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Use a finish date." };
  if (date !== null && date < lagosToday()) return { error: "The finish date can't be before today." };
  return stages.map((stage) => (stage.number === number ? { ...stage, expectedFinish: date } : stage));
}

export function addStage(stages: StagePlan[], input: { name: string; basis: string; amountKobo?: bigint }, rate: bigint): StagePlan[] | EditError {
  const trimmed = input.name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return { error: "A stage name needs 1 to 80 characters." };
  const recipe = stageRecipe(trimmed);
  const work = stages.filter((stage) => stage.kind !== "reserve");
  if (input.basis === "contract_milestones") {
    const amount = input.amountKobo ?? 0n;
    const last = work[work.length - 1];
    if (!last) return { error: "There is no stage to split." };
    const split = splitStage(stages, last.number, last.amountKobo - amount, rate);
    if (isError(split)) return split;
    const index = stages.findIndex((stage) => stage.number === last.number);
    return reprice(split.map((stage, position) => (position === index + 1
      ? { ...stage, name: trimmed, kind: recipe.kind, acceptanceCriteria: recipe.acceptanceCriteria, tags: recipe.tags, itemIds: [], billRefs: [], boqKobo: null, expectedFinish: null }
      : stage)), rate);
  }
  const reserveAt = stages.findIndex((stage) => stage.kind === "reserve");
  const blank: StagePlan = {
    number: 0,
    name: trimmed,
    kind: recipe.kind,
    netKobo: 0n,
    amountKobo: 0n,
    amountMicro: 0n,
    acceptanceCriteria: recipe.acceptanceCriteria,
    tags: recipe.tags,
    billRefs: [],
    expectedFinish: null,
    itemIds: [],
    boqKobo: null,
    source: "document",
  };
  const next = stages.slice();
  next.splice(reserveAt >= 0 ? reserveAt : next.length, 0, blank);
  return reprice(next, rate);
}

export function moveItem(
  stages: StagePlan[],
  item: { id: string; amountKobo: bigint },
  toNumber: number,
  rate: bigint,
): StagePlan[] | EditError {
  const from = stages.find((stage) => stage.itemIds.includes(item.id));
  const to = stages.find((stage) => stage.number === toNumber);
  const blocked = reserveError(from) ?? reserveError(to);
  if (blocked) return blocked;
  if (!from || !to) return { error: "Choose a stage to move this item into." };
  if (from.number === to.number) return reprice(stages, rate);
  if (from.amountKobo < item.amountKobo) return { error: "That item is larger than the stage." };
  return reprice(stages.map((stage) => {
    if (stage.number === from.number) {
      return {
        ...stage,
        amountKobo: stage.amountKobo - item.amountKobo,
        netKobo: stage.netKobo - item.amountKobo,
        itemIds: stage.itemIds.filter((id) => id !== item.id),
        boqKobo: stage.boqKobo === null ? null : stage.boqKobo - item.amountKobo,
      };
    }
    if (stage.number === to.number) {
      return {
        ...stage,
        amountKobo: stage.amountKobo + item.amountKobo,
        netKobo: stage.netKobo + item.amountKobo,
        itemIds: [...stage.itemIds, item.id],
        boqKobo: stage.boqKobo === null ? null : stage.boqKobo + item.amountKobo,
      };
    }
    return stage;
  }), rate);
}

export function removeStage(stages: StagePlan[], number: number, into: number | null, rate: bigint): StagePlan[] | EditError {
  const current = stages.find((stage) => stage.number === number);
  const blocked = reserveError(current);
  if (blocked) return blocked;
  if (!current) return { error: "That stage is not on the plan." };
  const work = stages.filter((stage) => stage.kind !== "reserve");
  if (work.length <= 1) return { error: "You can't remove the last stage." };
  const fallback = number === work[0]?.number ? work[1] : [...work].reverse().find((stage) => stage.number < number);
  const target = stages.find((stage) => stage.number === (into ?? fallback?.number));
  if (!target || target.number === current.number || target.kind === "reserve") return { error: "Choose a stage to move this money into." };
  const next = stages.filter((stage) => stage.number !== number).map((stage) => (stage.number === target.number
    ? {
      ...stage,
      amountKobo: stage.amountKobo + current.amountKobo,
      netKobo: stage.netKobo + current.netKobo,
      itemIds: [...stage.itemIds, ...current.itemIds],
      billRefs: [...new Set([...stage.billRefs, ...current.billRefs])],
      acceptanceCriteria: unionText(stage.acceptanceCriteria, current.acceptanceCriteria, 6),
      tags: [...new Set([...stage.tags, ...current.tags])],
      boqKobo: stage.boqKobo === null && current.boqKobo === null ? null : (stage.boqKobo ?? 0n) + (current.boqKobo ?? 0n),
    }
    : stage));
  return reprice(next, rate);
}
