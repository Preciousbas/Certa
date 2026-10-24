export const NO_STAGES_TO_FUND = "No stages to fund yet.";

export function showFundLock(stageCount: number, totalKobo: bigint): boolean {
  return stageCount > 0 && totalKobo > 0n;
}
