import { describe, expect, it } from "vitest";
import { PLAN_NOT_AGREED, showFundLock } from "./fund-lock.js";
import { stagesInLockRange, type LockStage } from "../../../src/lib/fund-range.js";

const stages: LockStage[] = [
  { id: "m", name: "Mobilisation", stageIndex: 0, onChainIdx: -1, kind: "mobilisation", funded: false, amountUsdc: 100n, amountNgnKobo: 100n },
  { id: "a", name: "One", stageIndex: 1, onChainIdx: 0, kind: "work", funded: true, amountUsdc: 10n, amountNgnKobo: 10n },
  { id: "b", name: "Two", stageIndex: 2, onChainIdx: 1, kind: "work", funded: false, amountUsdc: 20n, amountNgnKobo: 20n },
];

describe("fund lock visibility", () => {
  it("hides Lock when the plan is not agreed or the range is empty", () => {
    expect(showFundLock(2, 100n, false)).toBe(false);
    expect(PLAN_NOT_AGREED).toContain("accept the plan");
    const lines = stagesInLockRange(stages, 1);
    expect(lines.map((stage) => stage.id)).toEqual(["m"]);
    expect(showFundLock(lines.length, 0n, true)).toBe(false);
    expect(stagesInLockRange(stages, 2).map((stage) => stage.id)).toEqual(["m", "b"]);
  });
});
