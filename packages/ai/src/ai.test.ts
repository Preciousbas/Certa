import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assessStage, heuristicAssess } from "./assess.js";
import { buildDocx, buildXlsx, textFromUpload } from "./files.js";
import { extractContract } from "./parse.js";
import { INJECTED_BREAKDOWN, SAMPLE_BREAKDOWN } from "./sample.js";
import { decide } from "./schema.js";

async function pdfOf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    page.drawText(line.slice(0, 110), { x: 36, y: 800 - index * 14, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return doc.save();
}

describe("contract extraction", () => {
  it("parses the csv, docx, and xlsx breakdowns into the same summary", async () => {
    const csv = await extractContract(await textFromUpload("breakdown.csv", new TextEncoder().encode(SAMPLE_BREAKDOWN)));
    const docx = await extractContract(await textFromUpload("breakdown.docx", await buildDocx(SAMPLE_BREAKDOWN)));
    const xlsx = await extractContract(await textFromUpload("breakdown.xlsx", buildXlsx(SAMPLE_BREAKDOWN)));
    for (const parsed of [csv, docx, xlsx]) {
      expect(parsed.flags).toEqual([]);
      expect(parsed.summary.stages).toHaveLength(10);
      expect(parsed.summary.contractSumKobo).toBe("4500000000");
      expect(parsed.summary.stages[4]?.percentBps).toBe(1500);
      expect(parsed.summary.retentionBps).toBe(500);
    }
  });

  it("parses a pdf of the same sheet", async () => {
    const text = await textFromUpload("breakdown.pdf", await pdfOf(SAMPLE_BREAKDOWN));
    const parsed = await extractContract(text);
    expect(parsed.summary.stages).toHaveLength(10);
    expect(parsed.flags).toEqual([]);
  });

  it("flags a total that does not add up", async () => {
    const broken = SAMPLE_BREAKDOWN.replace("| 5\nContract", "| 40\nContract");
    const parsed = await extractContract(broken);
    expect(parsed.flags.join(" ")).toMatch(/100|0\.5%/);
  });

  it("ignores an injected instruction and never grows a tool field", async () => {
    const parsed = await extractContract(INJECTED_BREAKDOWN);
    expect(parsed.summary.contractSumKobo).toBe("4500000000");
    expect(parsed.summary.ambiguities.join(" ")).toMatch(/ignored/i);
    const hostile = { ...parsed.summary, releaseAll: true };
    expect(() => extractContract).toBeTypeOf("function");
    await expect(extractContract("no table here", { extractContract: async () => hostile, assessStage: async () => ({}) })).rejects.toThrow(/tool/);
  });
});

describe("stage decision", () => {
  it("holds low confidence and sends the middle band to a person", () => {
    expect(decide({ confidence: 0.92, completed: true })).toBe("recommend_release");
    expect(decide({ confidence: 0.78, completed: true })).toBe("consultant_review");
    expect(decide({ confidence: 0.4, completed: false })).toBe("hold");
    expect(decide({ confidence: 0.99, completed: true }, true)).toBe("hold");
  });

  it("flags missing guardrails", async () => {
    const result = await assessStage("Open edge at the slab and no guardrail beside the blockwork.");
    expect(result.assessment.safetyFlags.length).toBeGreaterThan(0);
    expect(heuristicAssess("First floor slab formwork is up and the rebar is tied.").assessment.stageIndex).toBe(4);
  });
});
