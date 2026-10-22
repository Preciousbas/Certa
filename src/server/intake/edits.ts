import { allocateMicro } from "../../lib/money/fx.js";
import type { StagePlan } from "./validate.js";

type EditError = { error: string };

function reprice(stages: StagePlan[], rate: bigint): StagePlan[] {
  const micros = allocateMicro(stages.map((stage) => stage.amountKobo), rate);
  return stages.map((stage, index) => ({ ...stage, number: index + 1, amountMicro: micros[index] ?? 0n }));
}

export function stageTotal(stages: StagePlan[]): bigint {
  return stages.reduce((sum, stage) => sum + stage.amountKobo, 0n);
}

export function splitStage(stages: StagePlan[], number: number, amountKobo: bigint, rate: bigint): StagePlan[] | EditError {
  const index = stages.findIndex((stage) => stage.number === number);
  const current = stages[index];
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
  if (!current || !following) return { error: "There is no next stage to merge." };
  const next = stages.slice();
  next.splice(index, 2, { ...current, amountKobo: current.amountKobo + following.amountKobo, netKobo: current.netKobo + following.netKobo, billRefs: [...current.billRefs, ...following.billRefs] });
  return reprice(next, rate);
}

export function reamount(stages: StagePlan[], number: number, amountKobo: bigint, rate: bigint): StagePlan[] | EditError {
  const index = stages.findIndex((stage) => stage.number === number);
  const current = stages[index];
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
