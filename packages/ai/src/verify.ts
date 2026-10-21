import { createHash } from "node:crypto";
import { heuristicAssess } from "./assess.js";
import { decide, StageAssessment, type ReleaseDecision } from "./schema.js";
import { z } from "zod";

export const PROMPT_VERSION = "vision-gate-1";
export const AUTO_THRESHOLD = 0.85;
export const DEFAULT_RELEASE_CAP_USDC = 1_000_000_000n;

const INJECTION = /ignore previous instructions|mark complete|release all funds|system prompt/i;

export const VisionVerdict = z
  .object({
    stageId: z.string().min(1),
    complete: z.boolean(),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.object({ item: z.string(), seen: z.boolean() }).strict()),
    concerns: z.array(z.string()),
    safetyFlags: z.array(z.string()),
  })
  .strict();

export type VisionVerdict = z.infer<typeof VisionVerdict>;

const ACTION_KEYS = ["action", "tool", "tool_calls", "release", "releaseAll", "release_all"];

export function stripAction(value: unknown): { clean: unknown; hadAction: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { clean: value, hadAction: false };
  const record = { ...(value as Record<string, unknown>) };
  let hadAction = false;
  for (const key of ACTION_KEYS) {
    if (key in record) {
      delete record[key];
      hadAction = true;
    }
  }
  return { clean: record, hadAction };
}

export function gateRelease(input: {
  confidence: number;
  complete: boolean;
  checksPass: boolean;
  amountUsdc: bigint;
  capUsdc?: bigint;
  injected: boolean;
  hadAction: boolean;
}): ReleaseDecision {
  if (input.hadAction || input.injected) return "consultant_review";
  if (!input.checksPass || input.confidence < 0.6) return "hold";
  const cap = input.capUsdc ?? DEFAULT_RELEASE_CAP_USDC;
  if (input.confidence >= AUTO_THRESHOLD && input.complete && input.amountUsdc <= cap) return "recommend_release";
  return "consultant_review";
}

export function verdictFromNotes(stageId: string, notes: string): VisionVerdict {
  const { assessment } = heuristicAssess(notes);
  return VisionVerdict.parse({
    stageId,
    complete: assessment.completed,
    confidence: assessment.confidence,
    evidence: [
      ...assessment.observations.map((item) => ({ item, seen: true })),
      ...assessment.missingEvidence.map((item) => ({ item, seen: false })),
    ],
    concerns: assessment.missingEvidence,
    safetyFlags: assessment.safetyFlags,
  });
}

export type VisionModel = {
  id: string;
  readPhoto(input: { stageId: string; notes: string; imageSha256: string; imageBase64?: string }): Promise<unknown>;
};

export type StageCheck = {
  verdict: VisionVerdict | null;
  decision: ReleaseDecision;
  model: string | null;
  source: "vision" | "text-check";
  promptVersion: string;
  inputHash: string;
  rawOutput: string | null;
  latencyMs: number;
  costUsdc: null;
  attempts: number;
};

function hashInput(stageId: string, notes: string, imageSha256: string): string {
  return createHash("sha256").update(`${stageId}\n${imageSha256}\n${notes}`).digest("hex");
}

export async function verifyStage(input: {
  stageId: string;
  notes: string;
  imageSha256: string;
  checksPass: boolean;
  amountUsdc: bigint;
  capUsdc?: bigint;
  model?: VisionModel;
  imageBase64?: string;
}): Promise<StageCheck> {
  const started = Date.now();
  const injected = INJECTION.test(input.notes);
  const base = {
    model: input.model?.id ?? null,
    source: input.model ? "vision" as const : "text-check" as const,
    promptVersion: PROMPT_VERSION,
    inputHash: hashInput(input.stageId, input.notes, input.imageSha256),
    costUsdc: null as null,
  };
  if (!input.model) {
    const verdict = verdictFromNotes(input.stageId, input.notes);
    if (injected) verdict.concerns.push("The photo text contained instructions. They were ignored.");
    return {
      ...base,
      verdict,
      decision: gateRelease({
        confidence: verdict.confidence,
        complete: verdict.complete,
        checksPass: input.checksPass,
        amountUsdc: input.amountUsdc,
        capUsdc: input.capUsdc,
        injected,
        hadAction: false,
      }),
      rawOutput: null,
      latencyMs: Date.now() - started,
      attempts: 1,
    };
  }
  let lastRaw = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const raw = await input.model.readPhoto({
        stageId: input.stageId,
        notes: input.notes,
        imageSha256: input.imageSha256,
        imageBase64: input.imageBase64,
      });
      lastRaw = JSON.stringify(raw);
      const stripped = stripAction(raw);
      const verdict = VisionVerdict.parse(stripped.clean);
      if (verdict.stageId !== input.stageId) throw new Error("The model named a different stage.");
      if (injected) verdict.concerns.push("The photo text contained instructions. They were ignored.");
      return {
        ...base,
        verdict,
        decision: gateRelease({
          confidence: verdict.confidence,
          complete: verdict.complete,
          checksPass: input.checksPass,
          amountUsdc: input.amountUsdc,
          capUsdc: input.capUsdc,
          injected,
          hadAction: stripped.hadAction,
        }),
        rawOutput: lastRaw,
        latencyMs: Date.now() - started,
        attempts: attempt,
      };
    } catch {
      if (attempt === 2) break;
    }
  }
  const fallback = verdictFromNotes(input.stageId, input.notes);
  fallback.concerns.push("The photo model did not return a usable check.");
  return {
    ...base,
    verdict: fallback,
    decision: "hold",
    rawOutput: lastRaw || null,
    latencyMs: Date.now() - started,
    attempts: 2,
  };
}

export function assessmentFromVerdict(verdict: VisionVerdict): StageAssessment {
  return StageAssessment.parse({
    stageIndex: 0,
    completed: verdict.complete,
    completionPct: verdict.complete ? 100 : 40,
    confidence: verdict.confidence,
    observations: verdict.evidence.filter((item) => item.seen).map((item) => item.item),
    safetyFlags: verdict.safetyFlags,
    missingEvidence: verdict.evidence.filter((item) => !item.seen).map((item) => item.item),
  });
}

export function decisionFromAssessment(assessment: StageAssessment): ReleaseDecision {
  return decide(assessment);
}
