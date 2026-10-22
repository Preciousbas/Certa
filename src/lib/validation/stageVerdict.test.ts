import { describe, expect, it } from "vitest";
import { StageVerdict } from "./stageVerdict.js";

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
