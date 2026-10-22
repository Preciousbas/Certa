export const FAIL_CONFIDENCE = 0.6;
export const DEFAULT_PASS_THRESHOLD = 0.75;

export type VerdictLabel = "pass" | "fail" | "unsure";
export type VerifyNext = "awaiting_certification" | "ai_fail" | "needs_more_evidence";
export type VerifyNotice = "B-VF-1" | "B-VF-2" | "B-VF-3" | "B-VF-4" | "B-VF-5" | "B-VF-6" | "B-VF-7" | "consultant_fyi";

export type DecideInput = {
  verdict: VerdictLabel;
  confidence: number;
  requiredCriteriaMet: boolean;
  observedStage: number | null;
  claimedStage: number;
  possibleFake: boolean;
  photoChecksOk: boolean;
  safetyFlags: readonly string[];
  threshold?: number;
};

export type VerifyDecision = {
  next: VerifyNext;
  notices: VerifyNotice[];
};

export function passThreshold(source = process.env.VERIFY_PASS_THRESHOLD): number {
  if (source === undefined || source === "") return DEFAULT_PASS_THRESHOLD;
  const value = +source;
  if (!Number.isFinite(value) || value < 0.6 || value > 0.95) return DEFAULT_PASS_THRESHOLD;
  return value;
}

export function decide(input: DecideInput): VerifyDecision {
  const threshold = input.threshold ?? passThreshold();
  const fake = input.possibleFake;
  const stageMatches = input.observedStage === input.claimedStage;
  const pass =
    input.verdict === "pass" &&
    input.confidence >= threshold &&
    input.requiredCriteriaMet &&
    stageMatches &&
    !fake &&
    input.photoChecksOk;
  const fail = input.verdict === "fail" && input.confidence >= FAIL_CONFIDENCE && !pass;
  const next: VerifyNext = pass ? "awaiting_certification" : fail ? "ai_fail" : "needs_more_evidence";
  const notices: VerifyNotice[] = pass
    ? ["B-VF-1", "B-VF-2", "B-VF-3"]
    : fail
      ? ["B-VF-4", "consultant_fyi"]
      : ["B-VF-5", "B-VF-6"];
  if (input.safetyFlags.length > 0) notices.push("B-VF-7");
  return { next, notices };
}
