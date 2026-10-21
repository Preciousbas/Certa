import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretGrid } from "../../src/server/intake/interpret.js";
import { parseBytes } from "../../src/server/intake/parse.js";
import { validateDraft } from "../../src/server/intake/validate.js";

const RATE = 133111n;

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`../fixtures/boq/${name}`, import.meta.url)));
}

describe("parsers", () => {
  it("reads the csv and the xlsx to the same contract sum", async () => {
    const csv = await parseBytes("duplex_lekki_sample.csv", fixture("duplex_lekki_sample.csv"));
    const xlsx = await parseBytes("duplex_lekki_sample.xlsx", fixture("duplex_lekki_sample.xlsx"));
    expect(csv.ok && xlsx.ok).toBe(true);
    if (!csv.ok || !xlsx.ok) return;
    expect(csv.document.chunks.some((chunk) => chunk.anchor.includes("!A"))).toBe(true);
    expect(xlsx.document.chunks.some((chunk) => chunk.anchor.startsWith("BoQ!"))).toBe(true);
    const csvPlan = validateDraft(interpretGrid(csv.document.rows), RATE);
    const xlsxPlan = validateDraft(interpretGrid(xlsx.document.rows), RATE);
    expect(csvPlan.contractSumKobo).toBe(5525500000n);
    expect(xlsxPlan.contractSumKobo).toBe(5525500000n);
    expect(xlsxPlan.stages).toHaveLength(9);
  });

  it("links a text pdf figure to a page anchor", async () => {
    const pdf = await parseBytes("duplex_lekki_sample.pdf", fixture("duplex_lekki_sample.pdf"));
    expect(pdf.ok).toBe(true);
    if (!pdf.ok) return;
    expect(pdf.document.kind).toBe("pdf_text");
    expect(pdf.document.chunks.some((chunk) => /^p\d+$/.test(chunk.anchor))).toBe(true);
    const plan = validateDraft(interpretGrid(pdf.document.rows), RATE);
    expect(plan.contractSumKobo).toBe(5525500000n);
  });

  it("marks a scanned pdf and a blurry photo for the scan message when no transcript exists", async () => {
    const scanned = await parseBytes("duplex_lekki_sample_scanned.pdf", fixture("duplex_lekki_sample_scanned.pdf"));
    const photo = await parseBytes("unreadable_blurry.jpg", fixture("unreadable_blurry.jpg"));
    expect(scanned.ok && photo.ok).toBe(true);
    if (scanned.ok) expect(scanned.document.scan).toBe(true);
    if (photo.ok) expect(photo.document.scan).toBe(true);
  });
});
