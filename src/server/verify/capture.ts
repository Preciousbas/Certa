import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureNonces, photos, sha256Hex, stages, submissions, type Database } from "@certa/db";
import { hammingHex, readJpegExif } from "@certa/shared";
import { and, eq, isNull } from "drizzle-orm";
import { audit } from "../audit.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { putObject } from "../storage.js";
import { transitionStage } from "../stages/transition.js";
import { PHASH_DUP_DISTANCE, checkCapture, stageOpenForCapture } from "./checks.js";
import { evidenceHash } from "./evidence.js";
import { inspectJpeg, stampJpeg } from "./jpeg.js";
import { C6, C9, STAGE_NOT_OPEN, formatWat } from "./messages.js";

function coord(value: number): string {
  const negative = value < 0;
  const scaled = Math.round(Math.abs(value) * 100000);
  const whole = Math.floor(scaled / 100000);
  const frac = String(scaled % 100000).padStart(5, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

async function saveBytes(key: string, bytes: Uint8Array, digest: string): Promise<string> {
  try {
    await putObject({ bucket: "photos", key, bytes, contentType: "image/jpeg", sha256: digest });
    return key;
  } catch {
    const dir = path.join(process.cwd(), "var", "photos");
    await mkdir(dir, { recursive: true });
    const name = `${digest.slice(0, 16)}-${path.basename(key)}`;
    await writeFile(path.join(dir, name), bytes);
    return `var/photos/${name}`;
  }
}

export async function issueCaptureNonce(
  db: Database,
  input: { projectId: string; userId: string; stageId: string },
): Promise<{ nonce: string; expiresAt: string } | { error: string; status: number }> {
  const stage = (await db.select().from(stages).where(and(eq(stages.id, input.stageId), eq(stages.projectId, input.projectId))))[0];
  if (!stage) return { error: "That stage is not on this project.", status: 404 };
  if (!stageOpenForCapture(stage.status, stage.funded)) return { error: STAGE_NOT_OPEN, status: 409 };
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(captureNonces).values({
    projectId: input.projectId,
    userId: input.userId,
    stageId: stage.id,
    nonceHash: sha256Hex(nonce),
    expiresAt: expires,
  });
  return { nonce, expiresAt: expires.toISOString() };
}

function duplicateKey(error: unknown): boolean {
  const row = error as { code?: string; cause?: { code?: string; message?: string }; message?: string };
  if (row?.code === "23505" || row?.cause?.code === "23505") return true;
  const text = `${row?.message ?? ""} ${row?.cause?.message ?? ""}`;
  return /duplicate key|unique constraint|photos_sha256_unique/i.test(text);
}

export async function storeCapturePhoto(
  db: Database,
  input: {
    projectId: string;
    workspaceId: string;
    userId: string;
    stageId: string;
    nonce: string;
    capturedAtMs: number;
    lat: number;
    lng: number;
    accuracyM: number;
    deviceInfo: string;
    bytes: Uint8Array;
    nowMs?: number;
    site: { lat: number; lng: number };
    radiusM: number;
  },
): Promise<{ accepted: boolean; message: string; photoId?: string; distanceM?: number }> {
  const now = input.nowMs ?? Date.now();
  const stage = (await db.select().from(stages).where(and(eq(stages.id, input.stageId), eq(stages.projectId, input.projectId))))[0];
  if (!stage) return { accepted: false, message: "That stage is not on this project." };
  if (!stageOpenForCapture(stage.status, stage.funded)) return { accepted: false, message: STAGE_NOT_OPEN };
  const nonceRow = (
    await db
      .select()
      .from(captureNonces)
      .where(
        and(
          eq(captureNonces.nonceHash, sha256Hex(input.nonce)),
          eq(captureNonces.userId, input.userId),
          eq(captureNonces.projectId, input.projectId),
          eq(captureNonces.stageId, stage.id),
          isNull(captureNonces.usedAt),
        ),
      )
  )[0];
  const nonceOk = Boolean(nonceRow && nonceRow.expiresAt.getTime() > now);
  const open = (
    await db.select().from(photos).where(and(eq(photos.stageId, stage.id), eq(photos.uploadedBy, input.userId), isNull(photos.submissionId)))
  ).filter((row) => row.nonce === input.nonce);
  if (open.length >= 8) return { accepted: false, message: "This set already has 8 photos. Send them for checking." };

  const digest = sha256Hex(input.bytes);
  const seen = await db.select().from(photos).where(and(eq(photos.projectId, input.projectId), eq(photos.sha256, digest)));
  let facts = { width: 0, height: 0, longSide: 0, meanLuma: 0, laplacian: 0, phash: "0" };
  try {
    facts = await inspectJpeg(input.bytes);
  } catch {
    facts = { width: 0, height: 0, longSide: 0, meanLuma: 0, laplacian: 0, phash: "0" };
  }
  const earlier = (await db.select().from(photos).where(eq(photos.projectId, input.projectId))).filter((row) => row.phash && row.phash !== "0");
  let similarId: string | null = null;
  for (const row of earlier) {
    if (hammingHex(facts.phash, row.phash) <= PHASH_DUP_DISTANCE) {
      similarId = row.id;
      break;
    }
  }
  const exif = readJpegExif(input.bytes);
  const result = checkCapture({
    nowMs: now,
    capturedAtMs: input.capturedAtMs,
    nonceIssuedAtMs: nonceRow?.createdAt.getTime() ?? now,
    nonceOk,
    point: { lat: input.lat, lng: input.lng },
    accuracyM: input.accuracyM,
    site: input.site,
    radiusM: input.radiusM,
    shaDuplicate: seen.length > 0,
    similarPhotoId: similarId,
    longSidePx: facts.longSide,
    meanLuma: facts.meanLuma,
    laplacian: facts.laplacian,
    exifPresent: exif.capturedAtMs !== null,
  });
  if (!result.ok) {
    return { accepted: false, message: result.message ?? "This photo was refused.", distanceM: result.distanceM };
  }
  const short = input.nonce.slice(0, 6);
  const label = `Certa ${short} ${formatWat(new Date(input.capturedAtMs))} ${coord(input.lat)}, ${coord(input.lng)}`;
  let stamped = input.bytes;
  try {
    stamped = await stampJpeg(input.bytes, label);
  } catch {
    stamped = input.bytes;
  }
  const stampedDigest = sha256Hex(stamped);
  const originalKey = await saveBytes(`${input.workspaceId}/${input.projectId}/original-${digest}.jpg`, input.bytes, digest);
  const stampedKey = await saveBytes(`${input.workspaceId}/${input.projectId}/stamped-${stampedDigest}.jpg`, stamped, stampedDigest);
  if (stage.status === "not_started") await transitionStage(db, stage.id, "in_progress");
  try {
    const [photo] = await db
      .insert(photos)
      .values({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        stageId: stage.id,
        uploadedBy: input.userId,
        storageKey: stampedKey,
        originalKey,
        sha256: digest,
        phash: facts.phash,
        capturedAt: new Date(input.capturedAtMs),
        receivedAt: new Date(now),
        gpsLat: input.lat,
        gpsLng: input.lng,
        accuracyM: input.accuracyM,
        distanceFromSiteM: result.distanceM,
        device: input.deviceInfo.slice(0, 300),
        checksJson: result.checks,
        exif,
        nonce: input.nonce,
        stampedKey,
        widthPx: facts.width,
        heightPx: facts.height,
      })
      .returning();
    return { accepted: true, message: "Photo kept.", photoId: photo?.id, distanceM: result.distanceM };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const existing = (await db.select().from(photos).where(and(eq(photos.projectId, input.projectId), eq(photos.sha256, digest))))[0];
    if (existing && existing.nonce === input.nonce && existing.uploadedBy === input.userId) {
      return { accepted: true, message: "Photo kept.", photoId: existing.id, distanceM: result.distanceM };
    }
    return { accepted: false, message: C6, distanceM: result.distanceM };
  }
}

export async function sendCaptureSet(
  db: Database,
  input: { projectId: string; workspaceId: string; userId: string; stageId: string; nonce: string },
): Promise<{ ok: true; message: string; submissionId: string } | { ok: false; message: string }> {
  const stage = (await db.select().from(stages).where(and(eq(stages.id, input.stageId), eq(stages.projectId, input.projectId))))[0];
  if (!stage || !stageOpenForCapture(stage.status, stage.funded)) return { ok: false, message: STAGE_NOT_OPEN };
  const nonceRow = (
    await db
      .select()
      .from(captureNonces)
      .where(and(eq(captureNonces.nonceHash, sha256Hex(input.nonce)), eq(captureNonces.userId, input.userId), eq(captureNonces.stageId, stage.id), isNull(captureNonces.usedAt)))
  )[0];
  if (!nonceRow || nonceRow.expiresAt.getTime() <= Date.now()) return { ok: false, message: "The capture session expired. Open the camera again." };
  const rows = (
    await db.select().from(photos).where(and(eq(photos.stageId, stage.id), eq(photos.uploadedBy, input.userId), isNull(photos.submissionId)))
  ).filter((row) => row.nonce === input.nonce);
  if (rows.length < 3) return { ok: false, message: "Send at least 3 photos that passed the checks." };
  const hash = evidenceHash(stage.id, rows.map((row) => row.sha256));
  const [submission] = await db
    .insert(submissions)
    .values({
      stageId: stage.id,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      submittedBy: input.userId,
      evidenceHash: hash,
      status: "verifying",
      decision: "pending",
    })
    .returning();
  if (!submission) return { ok: false, message: "The photos could not be sent." };
  for (const row of rows) {
    await db.update(photos).set({ submissionId: submission.id }).where(eq(photos.id, row.id));
  }
  await db.update(captureNonces).set({ usedAt: new Date() }).where(eq(captureNonces.id, nonceRow.id));
  if (stage.status === "not_started") await transitionStage(db, stage.id, "in_progress");
  await transitionStage(db, stage.id, "submitted");
  await transitionStage(db, stage.id, "ai_review");
  await audit(db, {
    action: "photos_submitted",
    entity: "submissions",
    entityId: submission.id,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    actor: input.userId,
    after: { photoIds: rows.map((row) => row.id), evidenceHash: hash },
  });
  await enqueueJob(db, { kind: "verify_stage", payload: { submissionId: submission.id }, dedupeKey: `verify_stage:${submission.id}` });
  return { ok: true, message: C9, submissionId: submission.id };
}
