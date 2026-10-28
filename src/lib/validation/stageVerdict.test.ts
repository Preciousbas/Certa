import { describe, expect, it } from "vitest";
import { StageVerdict, StageVerdictV3 } from "./stageVerdict.js";

const valid = {
  schema_version: "1" as const,
  stage_number_claimed: 4,
  stage_number_observed: 4,
  stage_name_observed: "First floor slab",
  verdict: "pass" as const,
  confidence: 0.86,
  criteria: [{ id: "c1", result: "met" as const, reason: "The slab soffit is clear in photo 1.", photo_refs: [1] }],
  reasons: ["The photos show the slab after the formwork came off."],
  issues: [],
  missing_shots: [],
  safety_flags: [],
};

describe("StageVerdict", () => {
  it("accepts the strict object", () => {
    expect(StageVerdict.parse(valid).verdict).toBe("pass");
  });

  it("rejects an extra key and a confidence above 1", () => {
    expect(StageVerdict.safeParse({ ...valid, note: "extra" }).success).toBe(false);
    expect(StageVerdict.safeParse({ ...valid, confidence: 1.2 }).success).toBe(false);
    expect(StageVerdict.safeParse({ ...valid, criteria: [] }).success).toBe(false);
  });
});

const checklist = {
  schema_version: "3" as const,
  stage_number_claimed: 2,
  items: [
    { id: "s2-trench", answer: "yes" as const, reason: "The footing trench is open." },
    { id: "s2-concrete", answer: "no" as const, reason: "No concrete base is in the trench." },
    { id: "s2-rebar", answer: "cannot_see" as const, reason: "The bars are outside the frame." },
  ],
};

describe("StageVerdictV3", () => {
  it("accepts yes, no, and cannot_see and rejects a stage name or a confidence", () => {
    expect(StageVerdictV3.parse(checklist).items).toHaveLength(3);
    expect(StageVerdictV3.safeParse({ ...checklist, stage_name_observed: "Foundation" }).success).toBe(false);
    expect(StageVerdictV3.safeParse({ ...checklist, confidence: 0.8 }).success).toBe(false);
    expect(StageVerdictV3.safeParse({ ...checklist, items: [{ id: "s2-trench", answer: "maybe", reason: "Unclear." }] }).success).toBe(false);
  });

  it("accepts a six-item checklist reply", () => {
    const item = (id: string) => ({ id, answer: "yes" as const, reason: "Seen." });
    const six = { ...checklist, items: ["c1", "c2", "c3", "c4", "c5", "c6"].map(item) };
    expect(StageVerdictV3.parse(six).items).toHaveLength(6);
    const nine = { ...checklist, items: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"].map(item) };
    expect(StageVerdictV3.safeParse(nine).success).toBe(false);
  });
});
