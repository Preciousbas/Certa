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
import { STAGE_VERIFY_SYSTEM, PROMPT_VERSION } from "../ai/prompts/stage_verify.v1.js";
import { criteriaOf, requiredMet } from "./criteria.js";
import { decide, type VerifyDecision } from "./decide.js";
import { CHECK_UNAVAILABLE } from "./messages.js";
import { notifyVerdict } from "./notify.js";
import { stageVerifyUserMessage } from "./prompt.js";
import { askVerdict, type VisionClient } from "./vision.js";
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

function similar(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "similar_to" in value && (value as { similar_to?: unknown }).similar_to);
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
  const allStages = (await db.select().from(stages).where(eq(stages.projectId, project.id))).sort((a, b) => a.stageIndex - b.stageIndex);
  const criteria = criteriaOf(stage.acceptanceCriteria);
  const claimed = stage.stageIndex + 1;

  let verdict: StageVerdict;
  let model = existing?.model ?? "unavailable";
  let raw: unknown = existing?.rawJson ?? {};
  let latency = existing?.latencyMs ?? 0;
  if (!existing) {
    const photoRows = (await db.select().from(photos).where(eq(photos.submissionId, submissionId))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const images: Uint8Array[] = [];
    for (const photo of photoRows) {
      const bytes = await readStored(photo.originalKey || photo.storageKey);
      if (bytes) images.push(bytes);
    }
    const previous = allStages.find((row) => row.stageIndex === stage.stageIndex - 1);
    const user = stageVerifyUserMessage({
      projectName: project.name,
      location: project.siteLocation,
      stages: allStages.map((row) => ({ number: row.stageIndex + 1, name: row.name })),
      claimedNumber: claimed,
      claimedName: stage.name,
      criteria,
      photos: photoRows.map((photo) => ({
        capturedAt: photo.capturedAt ?? photo.createdAt,
        distanceM: Math.round(photo.distanceFromSiteM ?? 0),
        similar: similar(photo.checksJson),
      })),
      previousStatus: previous?.status ?? null,
    });
    const asked = await askVerdict({
      system: deps?.system ?? STAGE_VERIFY_SYSTEM,
      user,
      images,
      client: deps?.client,
    });
    model = asked.model;
    latency = asked.latencyMs;
    if (asked.verdict) {
      verdict = { ...asked.verdict, stage_number_claimed: claimed };
      raw = { text: asked.raw, parsed: asked.verdict };
    } else if (asked.error === "timed out") {
      verdict = { ...unavailable(criteria, TIMED_OUT), stage_number_claimed: claimed };
      raw = { text: asked.raw, error: "timed out" };
    } else {
      verdict = { ...unavailable(criteria), stage_number_claimed: claimed };
      raw = { text: asked.raw, error: asked.error || CHECK_UNAVAILABLE };
    }
    await db.insert(aiVerdicts).values({
      submissionId,
      stageId: stage.id,
      model,
      promptVersion: deps?.promptVersion ?? PROMPT_VERSION,
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

  const photoRows = await db.select().from(photos).where(eq(photos.submissionId, submissionId));
  const decision = decide({
    verdict: verdict.verdict,
    confidence: verdict.confidence,
    requiredCriteriaMet: requiredMet(criteria, verdict.criteria),
    observedStage: verdict.stage_number_observed,
    claimedStage: claimed,
    possibleFake: verdict.issues.includes("possible_fake_evidence"),
    photoChecksOk: photoRows.length >= 3 && photoRows.every((photo) => checksOk(photo.checksJson)),
    safetyFlags: verdict.safety_flags,
  });

  if (stage.status === "ai_review") await transitionStage(db, stage.id, decision.next);
  await audit(db, {
    action: "ai_verdict",
    entity: "ai_verdicts",
    entityId: submissionId,
    projectId: project.id,
    workspaceId: project.workspaceId,
    actorKind: "agent",
    after: { verdict: verdict.verdict, confidence: verdict.confidence, next: decision.next, model, prompt: deps?.promptVersion ?? PROMPT_VERSION },
  });
  await notifyVerdict(db, decision.notices, {
    projectId: project.id,
    projectName: project.name,
    submissionId,
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
