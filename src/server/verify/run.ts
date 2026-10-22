import {
  aiVerdicts,
  chainTxs,
  photos,
  projects,
  stages,
  submissions,
  type Database,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { transitionStage } from "../stages/transition.js";
import { PROMPT_VERSION, STAGE_VERIFY_SYSTEM_V3 } from "../ai/prompts/stage_verify.v3.js";
import { criteriaOf } from "./criteria.js";
import { DEFAULT_PASS_THRESHOLD, type VerifyDecision, type VerifyNext, type VerifyNotice } from "./decide.js";
import { CHECK_UNAVAILABLE } from "./messages.js";
import { notifyVerdict } from "./notify.js";
import { agreeChecklistRuns, alignAnswers, scoreChecklist, type ChecklistScore, type ItemAnswer } from "./checklistScore.js";
import { checklistUserMessage, findChecklist } from "./checklists.js";
import { askChecklist, visionModels, VISION_TIMEOUT_MS, type VisionClient } from "./vision.js";
import type { StageVerdict } from "../../lib/validation/stageVerdict.js";
import { getObject } from "../storage.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type StageSubmitter = (db: Database, input: {
  projectId: string;
  stageId: string;
  submissionId: string;
  evidenceHash: `0x${string}`;
  stageIndex: number;
}) => Promise<{ txHash: string | null }>;

async function readStored(key: string): Promise<Uint8Array | null> {
  if (key.startsWith("var/photos/")) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "var", "photos", path.basename(key)));
      return Uint8Array.from(bytes);
    } catch {
      return null;
    }
  }
  try {
    const object = await getObject("photos", key);
    return object?.bytes ?? null;
  } catch {
    return null;
  }
}

function unavailable(criteria: { id: string }[], reason = CHECK_UNAVAILABLE): StageVerdict {
  return {
    schema_version: "1",
    stage_number_claimed: 1,
    stage_number_observed: null,
    stage_name_observed: null,
    verdict: "unsure",
    confidence: 0,
    criteria: criteria.map((item) => ({
      id: item.id,
      result: "not_visible",
      reason,
      photo_refs: [1],
    })),
    reasons: [reason],
    issues: [reason],
    missing_shots: ["Take clear photos of the work in daylight."],
    safety_flags: [],
  };
}

const TIMED_OUT = "The photo check took too long. A consultant can review these photos and send the stage on.";

function checksOk(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as { nonce_ok?: boolean; fresh?: boolean; in_radius?: boolean; not_duplicate?: boolean; image_ok?: boolean };
  return Boolean(row.nonce_ok && row.fresh && row.in_radius && row.not_duplicate && row.image_ok);
}

function noticesFor(next: VerifyNext): VerifyNotice[] {
  if (next === "awaiting_certification") return ["B-VF-1", "B-VF-2", "B-VF-3"];
  if (next === "ai_fail") return ["B-VF-4", "consultant_fyi"];
  return ["B-VF-5", "B-VF-6"];
}

function verdictFromItems(claimed: number, items: readonly ItemAnswer[], score: ChecklistScore, fallback: string): StageVerdict {
  const mapped = items.map((item) => ({
    id: item.id,
    result: item.answer === "yes" ? ("met" as const) : item.answer === "no" ? ("not_met" as const) : ("not_visible" as const),
    reason: (item.reason.trim() || fallback).slice(0, 200),
    photo_refs: [1],
  }));
  const reasons = mapped.map((item) => item.reason).filter((reason) => reason.length > 0).slice(0, 6);
  const issues = mapped.filter((item) => item.result === "not_met").map((item) => item.reason).slice(0, 8);
  const missing = mapped.filter((item) => item.result === "not_visible").map((item) => item.reason.slice(0, 160)).slice(0, 5);
  return {
    schema_version: "1",
    stage_number_claimed: claimed,
    stage_number_observed: score.verdict === "pass" ? claimed : null,
    stage_name_observed: null,
    verdict: score.verdict,
    confidence: score.confidence,
    criteria: mapped.length > 0 ? mapped : [{ id: "c1", result: "not_visible", reason: fallback, photo_refs: [1] }],
    reasons: reasons.length > 0 ? reasons : [fallback],
    issues,
    missing_shots: missing.length > 0 ? missing : score.verdict === "unsure" ? ["Take clear photos of the work in daylight."] : [],
    safety_flags: [],
  };
}

function nextFromStored(verdict: StageVerdict, photoOk: boolean): VerifyNext {
  if (verdict.verdict === "pass" && verdict.confidence >= DEFAULT_PASS_THRESHOLD && photoOk) return "awaiting_certification";
  if (verdict.verdict === "fail") return "ai_fail";
  return "needs_more_evidence";
}

export async function defaultSubmitStage(
  db: Database,
  input: Parameters<StageSubmitter>[1],
): Promise<{ txHash: string | null }> {
  const { submitStageTx } = await import("../chain/flows.js");
  const done = await submitStageTx(db, input);
  return { txHash: done.txHash };
}

export async function runVerifyStage(
  db: Database,
  submissionId: string,
  deps?: { client?: VisionClient; submit?: StageSubmitter; system?: string; promptVersion?: string },
): Promise<VerifyDecision | null> {
  const submission = (await db.select().from(submissions).where(eq(submissions.id, submissionId)))[0];
  if (!submission) return null;
  const stage = (await db.select().from(stages).where(eq(stages.id, submission.stageId)))[0];
  const project = stage ? (await db.select().from(projects).where(eq(projects.id, stage.projectId)))[0] : undefined;
  if (!stage || !project) return null;
  const existing = (await db.select().from(aiVerdicts).where(eq(aiVerdicts.submissionId, submissionId)))[0];
  const criteria = criteriaOf(stage.acceptanceCriteria);
  const claimed = stage.stageIndex + 1;
  const photoRows = (await db.select().from(photos).where(eq(photos.submissionId, submissionId))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const photoOk = photoRows.length >= 3 && photoRows.every((photo) => checksOk(photo.checksJson));

  let verdict: StageVerdict;
  let model = existing?.model ?? "unavailable";
  let raw: unknown = existing?.rawJson ?? {};
  let latency = existing?.latencyMs ?? 0;
  if (!existing) {
    const checklist = findChecklist(claimed);
    const images: Uint8Array[] = [];
    for (const photo of photoRows) {
      const bytes = await readStored(photo.originalKey || photo.storageKey);
      if (bytes) images.push(bytes);
    }
    if (!checklist) {
      verdict = { ...unavailable(criteria, "This stage has no photo checklist."), stage_number_claimed: claimed };
      raw = { error: "no checklist" };
    } else {
      const user = checklistUserMessage(claimed);
      const request = {
        system: deps?.system ?? STAGE_VERIFY_SYSTEM_V3,
        user,
        images,
        model: visionModels().primary,
        client: deps?.client,
        timeoutMs: VISION_TIMEOUT_MS,
      };
      const [left, right] = await Promise.all([askChecklist(request), askChecklist(request)]);
      const leftItems = left.reply ? alignAnswers(checklist.items, left.reply.items) : null;
      const rightItems = right.reply ? alignAnswers(checklist.items, right.reply.items) : null;
      let score = agreeChecklistRuns(
        leftItems ? scoreChecklist(leftItems) : null,
        rightItems ? scoreChecklist(rightItems) : null,
      );
      if (score.verdict === "pass" && !photoOk) {
        score = { ...score, verdict: "unsure", next: "needs_more_evidence" };
      }
      const timedOut = left.error === "timed out" || right.error === "timed out";
      const fallback = timedOut && score.verdict === "unsure" ? TIMED_OUT : CHECK_UNAVAILABLE;
      const items = (score.verdict === "fail" && rightItems && scoreChecklist(rightItems).verdict === "fail" ? rightItems : leftItems) ?? rightItems ?? [];
      verdict = verdictFromItems(claimed, items, score, fallback);
      model = visionModels().primary;
      latency = left.latencyMs + right.latencyMs;
      raw = {
        runs: [
          { text: left.raw, error: left.error, parsed: left.reply },
          { text: right.raw, error: right.error, parsed: right.reply },
        ],
      };
    }
    await db.insert(aiVerdicts).values({
      submissionId,
      stageId: stage.id,
      model,
      promptVersion: PROMPT_VERSION,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      rawJson: raw,
      criteriaResults: verdict.criteria,
      reasons: [...verdict.reasons],
      issues: [...verdict.issues],
      safetyFlags: [...verdict.safety_flags],
      missingShots: [...verdict.missing_shots],
      latencyMs: latency,
      costMicro: null,
    });
    await db.update(submissions).set({ status: "verified", confidence: verdict.confidence, aiAssessmentJson: verdict, decision: verdict.verdict }).where(eq(submissions.id, submissionId));
  } else {
    const stored = existing.rawJson as { parsed?: StageVerdict };
    const parsed = stored.parsed;
    verdict = parsed?.verdict
      ? parsed
      : {
          ...unavailable(criteria),
          stage_number_claimed: claimed,
          verdict: existing.verdict === "pass" || existing.verdict === "fail" || existing.verdict === "unsure" ? existing.verdict : "unsure",
          confidence: existing.confidence,
          reasons: existing.reasons.length > 0 ? existing.reasons : [CHECK_UNAVAILABLE],
          issues: existing.issues,
          safety_flags: existing.safetyFlags,
          missing_shots: existing.missingShots,
          criteria: criteria.map((item) => ({ id: item.id, result: "not_visible" as const, reason: CHECK_UNAVAILABLE, photo_refs: [1] })),
        };
  }

  const decision = { next: nextFromStored(verdict, photoOk), notices: noticesFor(nextFromStored(verdict, photoOk)) };

  if (stage.status === "ai_review") await transitionStage(db, stage.id, decision.next);
  await audit(db, {
    action: "ai_verdict",
    entity: "ai_verdicts",
    entityId: submissionId,
    projectId: project.id,
    workspaceId: project.workspaceId,
    actorKind: "agent",
    after: { verdict: verdict.verdict, confidence: verdict.confidence, next: decision.next, model, prompt: PROMPT_VERSION },
  });
  await notifyVerdict(db, decision.notices, {
    projectId: project.id,
    projectName: project.name,
    submissionId,
    stageId: stage.id,
    stageNumber: claimed,
    stageName: stage.name,
    amountKobo: stage.amountNgnKobo,
    confidencePct: Math.round(verdict.confidence * 100),
    reasons: [...verdict.reasons],
    issues: [...verdict.issues],
    missingShots: [...verdict.missing_shots],
    safetyFlags: [...verdict.safety_flags],
  });

  if (decision.next === "awaiting_certification" && submission.evidenceHash?.startsWith("0x")) {
    const already = (
      await db.select().from(chainTxs).where(eq(chainTxs.idempotencyKey, `submit_stage:${submissionId}`))
    )[0];
    if (!already) {
      const submit = deps?.submit ?? defaultSubmitStage;
      const sent = await submit(db, {
        projectId: project.id,
        stageId: stage.id,
        submissionId,
        evidenceHash: submission.evidenceHash as `0x${string}`,
        stageIndex: stage.onChainIdx,
      });
      if (sent.txHash) {
        await audit(db, {
          action: "stage_submitted_onchain",
          entity: "submissions",
          entityId: submissionId,
          projectId: project.id,
          workspaceId: project.workspaceId,
          actorKind: "system",
          after: { txHash: sent.txHash },
        });
      }
    }
  }
  return decision;
}
