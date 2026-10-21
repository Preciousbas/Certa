import { agentRouterVision, verifyStage } from "@certa/ai";
import { captureNonces, noteChainRelease, photos, sha256Hex, stages, submissions } from "@certa/db";
import { evaluatePhoto, readJpegExif } from "@certa/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Hex } from "viem";
import { broadcastStageRelease } from "../../../../lib/chain-release";
import { apiError, apiJson, captureFields, captureOutput, projectIdField } from "../../../../lib/schemas";
import { saveStampedPhoto, stampPhoto } from "../../../../lib/stamp-photo";
import { withAuth } from "../../../../lib/with-auth";
import { recordCaptureOutcome } from "../../../../../../src/server/stages/transition";

export const POST = withAuth(
  async ({ db, userId, project, form }) => {
    if (!form) return apiError(400, "Take the photo in the camera page.");
    const nonce = String(form.get("nonce") ?? "");
    const stageId = String(form.get("stageId") ?? "");
    const capturedAt = Number(form.get("capturedAt") ?? 0);
    const lat = form.get("lat");
    const lng = form.get("lng");
    const file = form.get("photo");
    if (!projectIdField.safeParse(stageId).success)
      return apiError(400, "Choose a stage before taking the photo.");
    if (!(file instanceof File)) return apiError(400, "Take the photo in the camera page.");
    const fields = captureFields.safeParse({
      projectId: String(form.get("projectId") ?? ""),
      stageId,
      nonce,
      capturedAt: String(form.get("capturedAt") ?? ""),
      ...(form.get("lat") ? { lat: String(form.get("lat")) } : {}),
      ...(form.get("lng") ? { lng: String(form.get("lng")) } : {}),
    });
    if (!fields.success) return apiError(400, "Take the photo in the camera page.");
    const unknown = [...form.keys()].filter((key) => !["photo", "projectId", "stageId", "nonce", "capturedAt", "lat", "lng"].includes(key));
    if (unknown.length > 0) return apiError(400, "Take the photo in the camera page.");
    const stage = (
      await db
        .select()
        .from(stages)
        .where(and(eq(stages.id, stageId), eq(stages.projectId, project.id)))
    )[0];
    if (!stage) return apiError(404, "That stage is not on this project.");
    const nonceRow = (
      await db
        .select()
        .from(captureNonces)
        .where(
          and(
            eq(captureNonces.nonceHash, sha256Hex(nonce)),
            eq(captureNonces.userId, userId),
            eq(captureNonces.projectId, project.id),
            eq(captureNonces.stageId, stage.id),
            isNull(captureNonces.usedAt),
          ),
        )
    )[0];
    const nonceValid = Boolean(nonceRow && nonceRow.expiresAt.getTime() > Date.now());
    if (nonceRow && nonceValid) {
      await db
        .update(captureNonces)
        .set({ usedAt: new Date() })
        .where(eq(captureNonces.id, nonceRow.id));
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const exif = readJpegExif(bytes);
    const digest = sha256Hex(bytes);
    const seen = await db.select().from(photos).where(eq(photos.sha256, digest));
    const formGps = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
    const gps = exif.gps ?? formGps;
    const checks = evaluatePhoto({
      nowMs: Date.now(),
      capturedAtMs: exif.capturedAtMs,
      exifPresent: exif.capturedAtMs !== null,
      gps,
      site: { lat: project.siteLat, lng: project.siteLng },
      radiusM: project.geofenceRadiusM,
      nonceValid,
      shaDuplicate: seen.length > 0,
      phashDuplicate: false,
      screenshotHeuristic: false,
      compressed: false,
    });
    if (checks.accepted && gps) {
      let stamped: Uint8Array<ArrayBufferLike> = bytes;
      let stampedKey: string | null = null;
      try {
        const when = new Date(exif.capturedAtMs ?? Date.now()).toISOString();
        stamped = await stampPhoto(
          bytes,
          `Certa ${when} ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`,
        );
        stampedKey = await saveStampedPhoto(digest, stamped);
      } catch {
        stampedKey = null;
      }
      const check = await verifyStage({
        stageId: stage.id,
        notes: `${stage.name}. ${stage.description}`,
        imageSha256: digest,
        checksPass: checks.trust === "high",
        amountUsdc: stage.amountUsdc,
        imageBase64: Buffer.from(stamped).toString("base64"),
        model: agentRouterVision() ?? undefined,
      });
      let releaseHash: Hex | null = null;
      const escrow = project.escrowAddress ?? "";
      if (check.decision === "recommend_release" && /^0x[a-fA-F0-9]{40}$/.test(escrow)) {
        try {
          releaseHash = await broadcastStageRelease(escrow as Hex, stage.stageIndex, stamped);
        } catch {
          releaseHash = null;
        }
      }
      const [submission] = await db
        .insert(submissions)
        .values({
          stageId: stage.id,
          projectId: project.id,
          workspaceId: project.workspaceId,
          submittedBy: userId,
          aiAssessmentJson: check,
          confidence: check.verdict?.confidence ?? null,
          decision: check.decision,
          evidenceHash: digest,
        })
        .returning();
      await db.insert(photos).values({
        projectId: project.id,
        workspaceId: project.workspaceId,
        submissionId: submission?.id,
        storageKey: `live/${digest}.jpg`,
        sha256: digest,
        phash: digest.slice(0, 16),
        capturedAt: new Date(exif.capturedAtMs ?? capturedAt),
        gpsLat: gps.lat,
        gpsLng: gps.lng,
        device: "mini-app",
        checksJson: checks,
        stampedKey,
      });
      await recordCaptureOutcome(db, stage.id, {
        pass: check.decision === "recommend_release",
        releasedOnChain: Boolean(releaseHash),
      });
      if (releaseHash) {
        await noteChainRelease(db, {
          projectId: project.id,
          workspaceId: project.workspaceId,
          stageId: stage.id,
          txHash: releaseHash,
          amountUsdc: stage.amountUsdc,
          amountNgnKobo: stage.amountNgnKobo,
        });
      }
    }
    return apiJson(captureOutput, checks, checks.accepted ? 200 : 422);
  },
  { roles: ["contractor", "subcontractor"], assignedStage: true, upload: true, ai: true },
);
