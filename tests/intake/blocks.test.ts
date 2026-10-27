import { describe, expect, it } from "vitest";
import { basisLine, figuresReady, stageFigureLines } from "../../src/server/intake/messages.js";
import { validateDraft } from "../../src/server/intake/validate.js";
import { interpretGrid, rowFromValues } from "../../src/server/intake/interpret.js";
import { blockARows, blockBRows, blockCRows, singleSheetRows } from "./fixtures/lekki-blocks.js";

const RATE = 150_000n;

function plan(rows: ReturnType<typeof interpretGrid> extends infer _T ? typeof blockARows : never) {
  return validateDraft(interpretGrid(rows), RATE);
}

const NAMES = ["Substructure", "Ground floor frame & blockwork", "Roof"];

describe("lekki blocks", () => {
  for (const [name, rows] of [["A", blockARows], ["B", blockBRows], ["C", blockCRows]] as const) {
    it(`block ${name} has three stages of 4000 naira and six items`, () => {
      const draft = interpretGrid(rows);
      const items = draft.bills.flatMap((bill) => bill.items.filter((item) => item.rowKind === "item"));
      expect(items).toHaveLength(6);
      const priced = plan(rows);
      expect(priced.contractSumKobo).toBe(1_200_000n);
      expect(priced.stages.map((stage) => stage.name)).toEqual(NAMES);
      expect(priced.stages.map((stage) => stage.amountKobo)).toEqual([400_000n, 400_000n, 400_000n]);
      expect(priced.stages.some((stage) => stage.amountKobo === 0n)).toBe(false);
      for (const code of ["V04", "V18"]) expect(priced.issues.some((issue) => issue.code === code)).toBe(false);
    });
  }

  it("splits a single sheet on stage markers", () => {
    const priced = plan(singleSheetRows);
    expect(priced.stages.map((stage) => stage.name)).toEqual([
      "Site clearing and setting out",
      "Foundation blinding concrete",
      "Blockwork to DPC level",
    ]);
    expect(priced.stages.map((stage) => stage.amountKobo)).toEqual([400_000n, 400_000n, 400_000n]);
  });

  it("splits one section by recipe when every item matches", () => {
    const rows = [
      rowFromValues("BOQ", 1, ["Client", "Genius"]),
      rowFromValues("BOQ", 2, ["Contractor", "Precious"]),
      rowFromValues("BOQ", 3, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
      rowFromValues("BOQ", 4, ["1", "Excavation to foundation trenches", "m3", "1", "1000", "1000"]),
      rowFromValues("BOQ", 5, ["2", "Foundation blinding concrete", "m3", "1", "1000", "1000"]),
      rowFromValues("BOQ", 6, ["3", "Roof timber trusses", "m2", "1", "1000", "1000"]),
      rowFromValues("BOQ", 7, ["4", "Aluminium roof covering", "m2", "1", "1000", "1000"]),
      rowFromValues("BOQ", 8, ["", "CONTRACT SUM", "", "", "", "4000"]),
    ];
    const priced = plan(rows);
    expect(priced.stages.map((stage) => stage.name)).toEqual(["Substructure", "Roof"]);
    expect(priced.stages.map((stage) => stage.amountKobo)).toEqual([200_000n, 200_000n]);
    expect(priced.issues.some((issue) => issue.code === "single_stage")).toBe(false);
  });

  it("keeps one stage and says so when a section has no signal", () => {
    const rows = [
      rowFromValues("BOQ", 1, ["Client", "Ada"]),
      rowFromValues("BOQ", 2, ["Contractor", "Emmy"]),
      rowFromValues("BOQ", 3, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
      rowFromValues("BOQ", 4, ["1", "Supply door", "nr", "1", "1000", "1000"]),
      rowFromValues("BOQ", 5, ["2", "Supply window", "nr", "1", "1000", "1000"]),
      rowFromValues("BOQ", 6, ["", "CONTRACT SUM", "", "", "", "2000"]),
    ];
    const priced = plan(rows);
    expect(priced.stages).toHaveLength(1);
    expect(priced.issues.find((issue) => issue.code === "single_stage")?.message).toBe(
      "Your file has one priced section, so Certa made 1 stage. You can split it into more stages on the Review page before you send it.",
    );
  });

  it("lists three stages in Figures ready for block A", () => {
    const priced = plan(blockARows);
    const text = figuresReady({
      project: "Lekki Duplex - Block A",
      sum: "₦12,000.00",
      vatPct: "0",
      stages: priced.stages.filter((stage) => stage.kind !== "reserve").length,
      retentionPct: "0",
      months: 6,
      warnings: priced.issues.length,
      link: "https://certa.example/review",
      lines: stageFigureLines(priced.stages),
      basis: basisLine(priced),
    });
    expect(text).toContain("3 stages");
    expect(text).toContain("1. Substructure — ₦4,000.00 (2 items)");
    expect(text).toContain("Ground floor frame & blockwork — ₦4,000.00");
    expect(text).toContain("Roof — ₦4,000.00");
    expect(text).toContain("Stages come from the bills in your BoQ.");
  });

  it("warns when the document states a different stage count", () => {
    const rows = [
      rowFromValues("BOQ", 1, ["Client", "Ada"]),
      rowFromValues("BOQ", 2, ["Contractor", "Emmy"]),
      rowFromValues("BOQ", 3, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
      rowFromValues("BOQ", 4, ["1", "Supply door", "nr", "1", "2000", "2000"]),
      rowFromValues("BOQ", 5, ["", "CONTRACT SUM", "", "", "", "2000"]),
      rowFromValues("BOQ", 6, ["The work is in 3 stages."]),
    ];
    const priced = plan(rows);
    expect(priced.stages).toHaveLength(1);
    expect(priced.issues.find((issue) => issue.code === "V20")?.message).toBe(
      "The document says 3 stages, but Certa found 1. Check the stages on the Review page.",
    );
  });
});
