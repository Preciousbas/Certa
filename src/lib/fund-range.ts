export type LockStage = {
  id: string;
  name: string;
  stageIndex: number;
  onChainIdx: number;
  kind: string;
  funded: boolean;
  amountUsdc: bigint;
  amountNgnKobo: bigint;
};

export function chainUpToIndex(stages: Pick<LockStage, "kind" | "stageIndex" | "onChainIdx">[], uiUpTo: number): number {
  const work = stages.filter((stage) => stage.kind !== "mobilisation" && stage.stageIndex <= uiUpTo);
  if (work.length === 0) return -1;
  return Math.max(...work.map((stage) => stage.onChainIdx));
}

export function expectedFundMicro(
  stages: Pick<LockStage, "kind" | "funded" | "amountUsdc" | "onChainIdx">[],
  upToStage: number,
): bigint {
  let total = 0n;
  for (const stage of stages) {
    if (stage.kind === "mobilisation") {
      if (!stage.funded && stage.amountUsdc > 0n) total += stage.amountUsdc;
      continue;
    }
    if (stage.onChainIdx <= upToStage && !stage.funded) total += stage.amountUsdc;
  }
  return total;
}

export function stagesInLockRange<T extends LockStage>(stages: T[], uiLimit: number): T[] {
  const mobilisation = stages.filter((stage) => stage.kind === "mobilisation" && !stage.funded && stage.amountUsdc > 0n);
  const work = stages.filter((stage) => stage.kind !== "mobilisation" && stage.stageIndex <= uiLimit && !stage.funded);
  return [...mobilisation, ...work].sort((a, b) => a.stageIndex - b.stageIndex);
}

export function defaultUpTo(stages: Pick<LockStage, "kind" | "funded" | "stageIndex">[]): number {
  const open = stages.filter((stage) => stage.kind !== "mobilisation" && !stage.funded).sort((a, b) => a.stageIndex - b.stageIndex);
  if (open.length === 0) return Math.max(0, stages.length - 1);
  return open[Math.min(4, open.length - 1)]?.stageIndex ?? 0;
}
