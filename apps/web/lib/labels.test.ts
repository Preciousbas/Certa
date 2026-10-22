import { nairaToKobo, usdcFromNgnKobo, fxRateFromNaira } from "@certa/shared";
import { describe, expect, it } from "vitest";
import { changeSummary, stageStatusLabel } from "./labels";

describe("labels", () => {
  it("does not echo database status words", () => {
    expect(stageStatusLabel("submitted")).toBe("Checking photos");
    expect(stageStatusLabel("released")).toBe("Released");
    expect(stageStatusLabel("funded")).toBe("Not started");
    expect(stageStatusLabel("mystery")).toBe("Not started");
  });

  it("reads a new stage as naira and USDC at the project rate", () => {
    const rate = fxRateFromNaira(1500n);
    const summary = changeSummary("new_stage", { name: "Extra soakaway", amountNgnKobo: nairaToKobo(900_000n).toString() }, rate);
    expect(summary?.title).toBe("New stage: Extra soakaway");
    expect(summary ? usdcFromNgnKobo(BigInt(summary.kobo), rate).toString() : "").toBe(summary?.usdc);
  });

  it("refuses a change it cannot read", () => {
    expect(changeSummary("new_stage", { raw: true }, fxRateFromNaira(1500n))).toBeNull();
  });
});
