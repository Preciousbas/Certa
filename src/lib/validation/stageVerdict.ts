import { z } from "zod";

export const StageVerdictV1 = z
  .object({
    schema_version: z.literal("1"),
    stage_number_claimed: z.number().int().min(1),
    stage_number_observed: z.number().int().min(1).nullable(),
    stage_name_observed: z.string().nullable(),
    verdict: z.enum(["pass", "fail", "unsure"]),
    confidence: z.number().min(0).max(1),
    criteria: z
      .array(
        z
          .object({
            id: z.string(),
            result: z.enum(["met", "not_met", "not_visible"]),
            reason: z.string().max(200),
            photo_refs: z.array(z.number().int().min(1)),
          })
          .strict(),
      )
      .min(1),
    reasons: z.array(z.string().max(200)).min(1).max(6),
    issues: z.array(z.string().max(200)).max(8),
    missing_shots: z.array(z.string().max(160)).max(5),
    safety_flags: z.array(z.string().max(160)).max(5),
  })
  .strict();

/** v1 and v2 model replies. Production parsing stays on this object. */
export const StageVerdict = StageVerdictV1;

export type StageVerdict = z.infer<typeof StageVerdictV1>;

export const ChecklistAnswer = z.enum(["yes", "no", "cannot_see"]);

/** Checklist reply. The model does not name the stage or supply a confidence. */
export const StageVerdictV3 = z
  .object({
    schema_version: z.literal("3"),
    stage_number_claimed: z.number().int().min(1),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1),
            answer: ChecklistAnswer,
            reason: z.string().max(200),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export type StageVerdictV3 = z.infer<typeof StageVerdictV3>;
