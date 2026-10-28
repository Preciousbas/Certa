export const NO_STAGES_TO_FUND = "No stages to fund yet.";

export function showFundLock(stageCount: number, totalKobo: bigint, agreed = true): boolean {
  return agreed && stageCount > 0 && totalKobo > 0n;
}

export const PLAN_NOT_AGREED = "Both sides must accept the plan first.";
