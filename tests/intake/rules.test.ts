import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citationHolds } from "../../src/server/intake/citations.js";
import { badType, ENCRYPTED } from "../../src/server/intake/messages.js";
import { detectFile, zipEntries } from "../../src/server/intake/detect.js";
import { mergeWithNext, reamount, splitStage, stageTotal } from "../../src/server/intake/edits.js";
import { canonicalJson, contentHash } from "../../src/server/intake/hash.js";
import { gridFromCsv, interpretGrid, rowFromValues } from "../../src/server/intake/interpret.js";
import { validateDraft, type StagePlan } from "../../src/server/intake/validate.js";

const RATE = 133111n;

function stagesFromSample(): StagePlan[] {
  const text = readFileSync(new URL("../fixtures/boq/duplex_lekki_sample.csv", import.meta.url), "utf8");
  return validateDraft(interpretGrid(gridFromCsv(text, "sample.csv")), RATE).stages;
}

describe("validation rules beyond the duplex pair", () => {
  it("blocks retention above 10 percent and allows 5 percent", () => {
    const high = validateDraft(
      interpretGrid([
        rowFromValues("t", 1, ["Client", "Ada"]),
        rowFromValues("t", 2, ["Contractor", "Emmy"]),
        rowFromValues("t", 3, ["Bill", "1", "Preliminaries"]),
        rowFromValues("t", 4, ["Item", "Description", "Unit", "Qty", "Rate", "Amount"]),
        rowFromValues("t", 5, ["1.1", "Preliminaries", "sum", "1", "1000000.00", "1000000.00"]),
        rowFromValues("t", 6, ["", "Carried to Summary", "", "", "", "1000000.00"]),
        rowFromValues("t", 7, ["General Summary"]),
        rowFromValues("t", 8, ["", "CONTRACT SUM", "1000000.00"]),
        rowFromValues("t", 9, ["Note", "Retention: 15% of each interim payment."]),
      ]),
      RATE,
    );
    expect(high.issues.some((issue) => issue.code === "V09")).toBe(true);
    const ok = validateDraft(interpretGrid(gridFromCsv(readFileSync(new URL("../fixtures/boq/duplex_lekki_sample.csv", import.meta.url), "utf8"), "s")), RATE);
    expect(ok.issues.some((issue) => issue.code === "V09")).toBe(false);
  });

  it("blocks milestone percentages that are not 100", () => {
    const plan = validateDraft(
      interpretGrid([
        rowFromValues("t", 1, ["Client", "Ada"]),
        rowFromValues("t", 2, ["Contractor", "Emmy"]),
        rowFromValues("t", 3, ["Milestone", "1", "Start", "40%"]),
        rowFromValues("t", 4, ["Milestone", "2", "Finish", "40%"]),
        rowFromValues("t", 5, ["", "CONTRACT SUM", "1000000.00"]),
      ]),
      RATE,
    );
    expect(plan.issues.some((issue) => issue.code === "V08")).toBe(true);
  });
});

describe("stage edits keep the contract sum", () => {
  it("split, merge and re-amount stay exact", () => {
    let stages = stagesFromSample();
    const total = stageTotal(stages);
    const split = splitStage(stages, 2, stages[1]!.amountKobo / 2n, RATE);
    expect("error" in split).toBe(false);
    if ("error" in split) return;
    expect(stageTotal(split)).toBe(total);
    const merged = mergeWithNext(split, 2, RATE);
    expect("error" in merged).toBe(false);
    if ("error" in merged) return;
    expect(stageTotal(merged)).toBe(total);
    const changed = reamount(merged, 1, merged[0]!.amountKobo + 5000n, RATE);
    expect("error" in changed).toBe(false);
    if ("error" in changed) return;
    expect(stageTotal(changed)).toBe(total);
    stages = changed;
    let seed = 7;
    for (let n = 0; n < 20; n += 1) {
      seed = (seed * 17 + 3) % 97;
      const index = (seed % stages.length) + 1;
      const current = stages.find((stage) => stage.number === index);
      if (!current || current.amountKobo < 2000n) continue;
      const next = reamount(stages, index, current.amountKobo - 1000n, RATE);
      if ("error" in next) continue;
      expect(stageTotal(next)).toBe(total);
      stages = next;
    }
  });
});

describe("content hash", () => {
  it("is stable when keys are reordered", () => {
    const left = contentHash({
      terms: { b: 1, a: 2 },
      stages: [{ name: "Slab", amount_kobo: "10", amount_micro: "2", criteria: ["Formwork is struck and the soffit is visible"], tags: ["concrete_pour"] }],
      fx: { kobo_per_usdc: "133111", source: "manual", as_of: "2026-10-15" },
      cap: "1000000",
      retention: "500",
      document_hashes: ["abc"],
    });
    const right = contentHash({
      document_hashes: ["abc"],
      retention: "500",
      cap: "1000000",
      fx: { as_of: "2026-10-15", source: "manual", kobo_per_usdc: "133111" },
      stages: [{ tags: ["concrete_pour"], criteria: ["Formwork is struck and the soffit is visible"], amount_micro: "2", amount_kobo: "10", name: "Slab" }],
      terms: { a: 2, b: 1 },
    });
    expect(left).toBe(right);
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});

describe("citations", () => {
  it("rejects a quote that is not in the chunk", () => {
    expect(citationHolds("300000.00", "F25=30000.00", "300000.00")).toBe(false);
    expect(citationHolds("30,000.00", "F25=30000.00", "30000.00")).toBe(true);
  });
});

describe("file detection messages", () => {
  it("uses the exact unsupported and encrypted sentences", () => {
    expect(badType("zip")).toBe("I can't read this type of file (zip). Please send a PDF, Word, Excel or CSV file, or a clear photo of each page.");
    expect(ENCRYPTED).toBe("This file is password-protected, so I can't open it. Please remove the password and send it again.");
  });

  it("rejects a zip whose directory claims a huge uncompressed size", async () => {
    const bytes = Buffer.alloc(80);
    bytes[0] = 0x50;
    bytes[1] = 0x4b;
    bytes[2] = 0x01;
    bytes[3] = 0x02;
    bytes.writeUInt32LE(200_000_000, 24);
    bytes.writeUInt16LE(1, 28);
    bytes[46] = 0x61;
    const eocd = bytes.length - 22;
    bytes[eocd] = 0x50;
    bytes[eocd + 1] = 0x4b;
    bytes[eocd + 2] = 0x05;
    bytes[eocd + 3] = 0x06;
    bytes.writeUInt16LE(1, eocd + 10);
    bytes.writeUInt32LE(0, eocd + 16);
    expect(zipEntries(bytes)).toBe("bomb");
    const detected = await detectFile("boom.xlsx", bytes);
    expect(detected.ok).toBe(false);
  });
});
