import { z } from "zod";

export const StageVerdict = z
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

export type StageVerdict = z.infer<typeof StageVerdict>;
