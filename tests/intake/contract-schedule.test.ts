import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDocx } from "@certa/ai";
import { rowFromValues } from "../../src/server/intake/interpret.js";
import { parseBytes } from "../../src/server/intake/parse.js";
import { planFromRows } from "../../src/server/intake/read.js";
import { basisLine, figureNotes, figuresReady, stageFigureLines } from "../../src/server/intake/messages.js";
import type { ValidatedPlan } from "../../src/server/intake/validate.js";

const RATE = 150_000n;
const TEXT = readFileSync(new URL("../fixtures/contracts/five_stage_contract.txt", import.meta.url), "utf8");

const EXPECTED = [
  ["Mobilisation and site set-up", 100_000_000n, "2026-11-10"],
  ["Substructure", 200_000_000n, "2026-12-01"],
  ["Ground floor frame and blockwork", 300_000_000n, "2027-01-15"],
  ["Roof", 250_000_000n, "2027-02-15"],
  ["Finishes and handover", 150_000_000n, "2027-03-31"],
] as const;

function expectSchedule(plan: ValidatedPlan) {
  expect(plan.contractSumKobo).toBe(1_000_000_000n);
  expect(plan.basis).toBe("contract_milestones");
  expect(plan.retentionBps).toBe(500);
  expect(plan.defectsMonths).toBe(6);
  expect(plan.stages.map((stage) => [stage.name, stage.amountKobo, stage.expectedFinish])).toEqual(EXPECTED.map((row) => [...row]));
  expect(plan.issues.filter((issue) => issue.severity === "blocking")).toEqual([]);
}

describe("contract payment schedule", () => {
  it("reads the five-stage contract from plain text", async () => {
    const parsed = await parseBytes("five_stage_contract.txt", new TextEncoder().encode(TEXT));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expectSchedule(planFromRows(parsed.document.rows, RATE).plan);
  });

  it("reads the same schedule from docx paragraphs", async () => {
    const docx = await buildDocx(TEXT);
    const parsed = await parseBytes("five_stage_contract.docx", docx);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expectSchedule(planFromRows(parsed.document.rows, RATE).plan);
  });

  it("reads a percentage table with no amount column filled in", () => {
    const rows = [
      rowFromValues("t", 1, ["Client", "Genius"]),
      rowFromValues("t", 2, ["Contractor", "Precious"]),
      rowFromValues("t", 3, ["Contract Sum: N10,000,000.00 (Ten Million Naira)"]),
      rowFromValues("t", 4, ["Stage", "Description", "Percentage", "Amount", "Due date"]),
      rowFromValues("t", 5, ["1", "Mobilisation and site set-up", "10%", "", "10 November 2026"]),
      rowFromValues("t", 6, ["2", "Substructure", "20%", "", "1 December 2026"]),
      rowFromValues("t", 7, ["3", "Ground floor frame and blockwork", "30%", "", "15 January 2027"]),
      rowFromValues("t", 8, ["4", "Roof", "25%", "", "15 February 2027"]),
      rowFromValues("t", 9, ["5", "Finishes and handover", "15%", "", "31 March 2027"]),
      rowFromValues("t", 10, ["Retention: 5% of each payment, released after the 6-month defects period."]),
    ];
    expectSchedule(planFromRows(rows, RATE).plan);
  });

  it("prices the milestone sample pdf from percentages, not the stage number", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("../fixtures/boq/milestones_contract_sample.pdf", import.meta.url)));
    const parsed = await parseBytes("milestones_contract_sample.pdf", bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planFromRows(parsed.document.rows, RATE).plan;
    expect(plan.stages.map((stage) => [stage.name, stage.amountKobo])).toEqual([
      ["Mobilisation", 185_000_000n],
      ["Substructure", 370_000_000n],
      ["Ground floor", 370_000_000n],
      ["Roof", 370_000_000n],
      ["Finishes", 370_000_000n],
      ["Handover", 185_000_000n],
    ]);
    expect(plan.issues.filter((issue) => issue.severity === "blocking")).toEqual([]);
  });

  it("keeps a schedule entry that has no amount or percentage", () => {
    const rows = [
      rowFromValues("t", 1, ["Client", "Genius"]),
      rowFromValues("t", 2, ["Contractor", "Precious"]),
      rowFromValues("t", 3, ["Contract Sum: N4,000.00"]),
      rowFromValues("t", 4, ["Stage 1 - Substructure: N4,000.00"]),
      rowFromValues("t", 5, ["Stage 2 - Roof"]),
    ];
    const plan = planFromRows(rows, RATE).plan;
    expect(plan.stages).toHaveLength(2);
    expect(plan.stages[1]?.amountKobo).toBe(0n);
    expect(plan.issues.find((issue) => issue.code === "V21")?.message).toBe(
      "Stage 2 (Roof) has no amount or percentage. Enter it on the Review page.",
    );
  });

  it("uses a stubbed model only when every citation is in the text", () => {
    const quote = "Stage 1 Mobilisation 100 percent of the contract sum";
    const model = JSON.stringify(modelExtraction(quote, "999.00"));
    const held = planFromRows([[]], RATE, { modelText: model, chunks: [{ content: quote }] }).plan;
    expect(held.basis).toBe("contract_milestones");
    expect(held.stages.map((stage) => stage.source)).toEqual(["model", "model"]);
    expect(held.stages.map((stage) => stage.amountKobo)).toEqual([600_000_000n, 400_000_000n]);
    expect(held.contractSumKobo).toBe(1_000_000_000n);
    const dropped = planFromRows([[]], RATE, { modelText: model, chunks: [{ content: "a different sentence" }] }).plan;
    expect(dropped.stages).toHaveLength(0);
  });

  it("says five stages in Figures ready", async () => {
    const parsed = await parseBytes("five_stage_contract.txt", new TextEncoder().encode(TEXT));
    if (!parsed.ok) throw new Error("parse");
    const plan = planFromRows(parsed.document.rows, RATE).plan;
    const text = figuresReady({
      project: "Lekki Duplex Block D",
      sum: "₦10,000,000.00",
      vatPct: "0",
      stages: plan.stages.filter((stage) => stage.kind !== "reserve").length,
      retentionPct: "5",
      months: 6,
      warnings: plan.issues.length,
      link: "https://certa.example/review",
      lines: stageFigureLines(plan.stages),
      basis: basisLine(plan),
      notes: figureNotes(plan),
    });
    expect(text).toContain("5 stages");
    expect(text).toContain("Mobilisation and site set-up — ₦1,000,000.00");
    expect(text).toContain("due 10 Nov 2026");
    expect(text).toContain("Stages come from the contract's payment schedule.");
  });
});

function field<T>(value: T) {
  return { value, confidence: 1, source: null };
}

function modelExtraction(quote: string, ignoredAmount: string) {
  const source = { document_id: "11111111-1111-4111-8111-111111111111", anchor: "para1", quote };
  const criteria = ["The work in this stage is complete.", "A photo shows the work.", "The client can see the stage."];
  return {
    schema_version: "1",
    currency: field("NGN"),
    parties: {
      client: { name: field("Genius"), address: field(null), email: field(null), phone: field(null) },
      contractor: { name: field("Precious"), address: field(null), email: field(null), phone: field(null) },
      consultant: null,
    },
    project: {
      name: field("Lekki"),
      location: field(null),
      description: field(null),
      start_date: field(null),
      completion_date: field(null),
      duration_weeks: field(null),
      defects_liability_months: field(6),
    },
    sums: {
      contract_sum: { value: "10000000.00", confidence: 1, source },
      contract_sum_includes_vat: field(false),
      vat_rate_pct: field(null),
      vat_amount: field(null),
      preliminaries: field(null),
      provisional_sums: [],
      prime_cost_sums: [],
      contingency: field(null),
      contingency_pct: field(null),
    },
    boq: null,
    payment_terms: {
      method: field("milestones"),
      payment_period_days: field(null),
      advance_amount: field(null),
      advance_pct: field(null),
      advance_recovery: field(null),
      retention_pct: field("5"),
      retention_release: field(null),
      ld_amount: field(null),
      ld_period: field(null),
      ld_cap_pct: field(null),
      fluctuation_clause: field(null),
      variation_procedure: field(null),
      milestones: [
        { name: "Mobilisation", pct: "60", amount: ignoredAmount, source },
        { name: "Roof", pct: "40", amount: ignoredAmount, source },
      ],
    },
    stages_proposal: {
      basis: "contract_milestones",
      stages: [{
        number: 1,
        name: "Mobilisation",
        kind: "mobilisation",
        bill_refs: [],
        milestone_amount: "10000000.00",
        acceptance_criteria: criteria,
        tags: [],
      }],
      reserve: { includes: [] },
    },
    issues: [],
  };
}
