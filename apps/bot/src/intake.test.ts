import { describe, expect, it } from "vitest";
import { applyGapAnswer, contractGaps, contractNote, filenameOf } from "./intake.js";
import type { ContractSummary } from "@certa/ai";

function summary(overrides: Partial<ContractSummary> = {}): ContractSummary {
  return {
    parties: [],
    contractSumKobo: "2200000000",
    currency: "NGN",
    stages: Array.from({ length: 22 }, (_, index) => ({
      name: `Stage ${index + 1}`,
      description: "Work",
      percentBps: index < 20 ? 400 : 1000,
      amountKobo: "100000000",
    })),
    retentionBps: 500,
    defectsPeriodDays: 90,
    mobilisationBps: 1000,
    deadlines: [],
    paymentTerms: "Stage payments.",
    liquidatedDamages: "",
    ambiguities: [],
    ...overrides,
  };
}

describe("contract intake", () => {
  it("accepts a spreadsheet and refuses a photo", () => {
    expect(filenameOf({ file_name: "works.xlsx" })).toBe("works.xlsx");
    expect(filenameOf({ file_name: "scan.pdf", mime_type: "application/pdf" })).toBe("scan.pdf");
    expect(filenameOf({ file_name: "site.jpg", mime_type: "image/jpeg" })).toBe("site.jpg");
    expect(filenameOf({ file_name: "scan.heic", mime_type: "image/heic" })).toBe("scan.heic");
    expect(filenameOf({ file_name: "notes.bin", mime_type: "application/octet-stream" })).toBeNull();
  });

  it("lists every stage the file contained", () => {
    const note = contractNote(summary());
    expect(note).toMatch(/^22 stages/);
    expect(note).toMatch(/22\. Stage 22/);
  });

  it("asks for the terms a complete table still leaves blank", () => {
    const ids = contractGaps(summary()).map((question) => question.id);
    expect(ids).toEqual(["client", "contractor", "site", "damages", "deadline"]);
  });

  it("stores a retention percent and a site address", () => {
    const open = summary({ retentionBps: 0 });
    expect(contractGaps(open).some((question) => question.id === "retention")).toBe(true);
    const retained = applyGapAnswer(open, "retention", "5%");
    expect(retained.ok && retained.summary.retentionBps).toBe(500);
    const site = applyGapAnswer(summary(), "site", "Ikeja, Lagos");
    expect(site.ok && site.site).toBe("Ikeja, Lagos");
  });
});