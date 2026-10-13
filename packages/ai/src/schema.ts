import { z } from "zod";

export const StageDraft = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    amountKobo: z.string().regex(/^\d+$/).optional(),
    percentBps: z.number().int().nonnegative().max(10_000).optional(),
  })
  .strict();

export const ContractSummary = z
  .object({
    parties: z.array(z.object({ role: z.string(), name: z.string() }).strict()),
    contractSumKobo: z.string().regex(/^\d+$/),
    currency: z.literal("NGN"),
    stages: z.array(StageDraft).min(1),
    retentionBps: z.number().int().min(0).max(10_000),
    defectsPeriodDays: z.number().int().nonnegative(),
    mobilisationBps: z.number().int().min(0).max(10_000),
    deadlines: z.array(z.string()),
    paymentTerms: z.string(),
    liquidatedDamages: z.string(),
    ambiguities: z.array(z.string()),
  })
  .strict();

export type ContractSummary = z.infer<typeof ContractSummary>;

export const StageAssessment = z
  .object({
    stageIndex: z.number().int().nonnegative(),
    completed: z.boolean(),
    completionPct: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    observations: z.array(z.string()),
    safetyFlags: z.array(z.string()),
    missingEvidence: z.array(z.string()),
  })
  .strict();

export type StageAssessment = z.infer<typeof StageAssessment>;

export type ReleaseDecision = "recommend_release" | "consultant_review" | "hold";

export function decide(assessment: Pick<StageAssessment, "confidence" | "completed">, errored = false): ReleaseDecision {
  if (errored || assessment.confidence < 0.6) return "hold";
  if (assessment.confidence >= 0.85 && assessment.completed) return "recommend_release";
  return "consultant_review";
}

export interface LanguageModel {
  extractContract(text: string): Promise<unknown>;
  assessStage(input: { notes: string; stageNames: string[] }): Promise<unknown>;
}

const INJECTION = /ignore previous instructions|release all funds|system prompt/i;

export function assertNoToolCall(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if ("tool" in record || "tool_calls" in record || "releaseAll" in record || "release_all" in record) {
    throw new Error("Document content cannot trigger a tool.");
  }
}

export function parseSummary(value: unknown, sourceText = ""): ContractSummary {
  assertNoToolCall(value);
  const summary = ContractSummary.parse(value);
  if (INJECTION.test(sourceText) && !summary.ambiguities.some((item) => /ignored/i.test(item))) {
    summary.ambiguities.push("The file contained instructions aimed at the extractor. They were ignored.");
  }
  return summary;
}
