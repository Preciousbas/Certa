import { DEFAULT_PASS_THRESHOLD, type VerifyNext } from "./decide.js";
import type { ChecklistItem } from "./checklists.js";

export type ItemAnswer = {
  id: string;
  answer: "yes" | "no" | "cannot_see";
  reason: string;
};

export type ChecklistScore = {
  confidence: number;
  verdict: "pass" | "fail" | "unsure";
  next: VerifyNext;
  yes: number;
  no: number;
  cannotSee: number;
};

const CLEAR_REASON_CHARS = 8;

export function clearReason(reason: string): boolean {
  return reason.trim().length >= CLEAR_REASON_CHARS;
}

export function alignAnswers(checklist: readonly ChecklistItem[], reply: readonly ItemAnswer[]): ItemAnswer[] {
  return checklist.map((item) => {
    const found = reply.find((row) => row.id === item.id);
    if (!found) return { id: item.id, answer: "cannot_see", reason: "The reply skipped this item." };
    return found;
  });
}

/** Confidence is yes answers divided by the checklist length. The model does not supply it. */
export function scoreChecklist(items: readonly ItemAnswer[], threshold = DEFAULT_PASS_THRESHOLD): ChecklistScore {
  const total = items.length;
  const yes = items.filter((item) => item.answer === "yes").length;
  const nos = items.filter((item) => item.answer === "no");
  const cannotSee = items.filter((item) => item.answer === "cannot_see").length;
  const confidence = total === 0 ? 0 : yes / total;
  const clearNo = nos.some((item) => clearReason(item.reason));
  if (clearNo) {
    return { confidence, verdict: "fail", next: "ai_fail", yes, no: nos.length, cannotSee };
  }
  if (nos.length === 0 && total > 0 && confidence >= threshold) {
    return { confidence, verdict: "pass", next: "awaiting_certification", yes, no: 0, cannotSee };
  }
  return { confidence, verdict: "unsure", next: "needs_more_evidence", yes, no: nos.length, cannotSee };
}

/** A pass stands only when both runs pass. One clear no fails the pair. A missing run cannot pass. */
export function agreeChecklistRuns(first: ChecklistScore | null, second: ChecklistScore | null): ChecklistScore {
  if (first && second) return combineChecklistRuns(first, second);
  if (first?.verdict === "fail") return { ...first, verdict: "fail", next: "ai_fail" };
  if (second?.verdict === "fail") return { ...second, verdict: "fail", next: "ai_fail" };
  return {
    confidence: first?.confidence ?? second?.confidence ?? 0,
    verdict: "unsure",
    next: "needs_more_evidence",
    yes: first?.yes ?? second?.yes ?? 0,
    no: first?.no ?? second?.no ?? 0,
    cannotSee: first?.cannotSee ?? second?.cannotSee ?? 0,
  };
}

/** A pass stands only when both runs pass. One clear no fails the pair. */
export function combineChecklistRuns(first: ChecklistScore, second: ChecklistScore): ChecklistScore {
  if (first.verdict === "fail" || second.verdict === "fail") {
    const fail = first.verdict === "fail" ? first : second;
    return { ...fail, verdict: "fail", next: "ai_fail" };
  }
  if (first.verdict === "pass" && second.verdict === "pass") {
    return {
      ...first,
      confidence: Math.min(first.confidence, second.confidence),
      verdict: "pass",
      next: "awaiting_certification",
    };
  }
  return {
    ...first,
    confidence: Math.min(first.confidence, second.confidence),
    verdict: "unsure",
    next: "needs_more_evidence",
  };
}
