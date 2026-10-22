import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gridFromCsv, interpretGrid } from "../../src/server/intake/interpret.js";
import { validateDraft } from "../../src/server/intake/validate.js";

const RATE = 133111n;

function plan(name: string) {
  const text = readFileSync(new URL(`../fixtures/boq/${name}`, import.meta.url), "utf8");
  return validateDraft(interpretGrid(gridFromCsv(text, name)), RATE);
}

describe("duplex lekki sample", () => {
  it("passes V01 to V05 and prices the contract", () => {
    const priced = plan("duplex_lekki_sample.csv");
    for (const code of ["V01", "V02", "V03", "V04", "V05"]) {
      expect(priced.issues.some((issue) => issue.code === code)).toBe(false);
    }
    expect(priced.contractSumKobo).toBe(5525500000n);
    expect(priced.vatBps).toBe(750);
    expect(priced.vatKobo).toBe(385500000n);
    expect(priced.retentionBps).toBe(500);
    expect(priced.defectsMonths).toBe(6);
    expect(priced.defectsPeriodDays).toBe(180);
  });

  it("builds nine stages including VAT and micro-USDC", () => {
    const priced = plan("duplex_lekki_sample.csv");
    expect(priced.basis).toBe("boq_grouping");
    expect(priced.stages.map((stage) => stage.name)).toEqual([
      "Mobilisation & site set-up",
      "Substructure",
      "Ground floor frame & blockwork",
      "Upper floor",
      "Roof",
      "Finishes",
      "Services",
      "External works",
      "Reserve: provisional sum + contingency (variations only)",
    ]);
    expect(priced.stages.map((stage) => stage.amountMicro)).toEqual([
      2018991669n,
      8525636499n,
      4699647287n,
      7914447341n,
      5007099338n,
      6016595172n,
      3149627003n,
      1432595728n,
      2745828669n,
    ]);
    expect(priced.stages.reduce((sum, stage) => sum + stage.amountMicro, 0n)).toBe(41510468706n);
    expect(priced.spendingCapMicro).toBe(4262000000n);
  });
});

describe("duplex lekki messy", () => {
  it("reports the five planted faults and ignores the injected sum", () => {
    const priced = plan("duplex_lekki_messy.csv");
    const messages = priced.issues.map((issue) => issue.message);
    expect(messages).toContain("Bill 3, item 3.4: 25 m × ₦12,000.00 = ₦300,000.00, but the document says ₦30,000.00 (difference ₦270,000.00).");
    expect(messages).toContain("Bill 3 items add up to ₦5,549,300.00, but the bill total says ₦5,819,300.00 (difference ₦270,000.00). Item 3.4 looks like the cause.");
    expect(messages).toContain("VAT at 7.5% of ₦51,400,000.00 is ₦3,855,000.00, but the document says ₦3,885,000.00 (difference ₦30,000.00).");
    expect(messages).toContain("This document contains text that looks like an instruction to software (Bill 6, row 41). Certa ignored it. Please check the document is genuine.");
    expect(messages).toContain("The items, sums and correctly calculated VAT add up to ₦55,255,000.00, but the contract sum says ₦55,285,000.00 (difference ₦30,000.00).");
    expect(priced.contractSumKobo).toBe(5525500000n);
    expect(messages.join("\n")).not.toContain("90,000,000");
  });
});
