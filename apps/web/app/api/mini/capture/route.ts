import { apiError, apiJson, captureFields, captureOutput, projectIdField } from "../../../../lib/schemas";
import { storeCapturePhoto } from "../../../../../../src/server/verify/capture";
import { withAuth } from "../../../../lib/with-auth";

const ALLOWED = ["photo", "projectId", "stageId", "nonce", "capturedAt", "lat", "lng", "accuracy", "deviceInfo"];

export const POST = withAuth(
  async ({ db, userId, project, form }) => {
    if (!form) return apiError(400, "Take the photo in the camera page.");
    const file = form.get("photo");
    if (!(file instanceof File)) return apiError(400, "Take the photo in the camera page.");
    const stageId = String(form.get("stageId") ?? "");
    if (!projectIdField.safeParse(stageId).success) return apiError(400, "Choose a stage before taking the photo.");
    const fields = captureFields.safeParse({
      projectId: String(form.get("projectId") ?? ""),
      stageId,
      nonce: String(form.get("nonce") ?? ""),
      capturedAt: String(form.get("capturedAt") ?? ""),
      lat: String(form.get("lat") ?? ""),
      lng: String(form.get("lng") ?? ""),
      accuracy: String(form.get("accuracy") ?? ""),
      ...(form.get("deviceInfo") ? { deviceInfo: String(form.get("deviceInfo")) } : {}),
    });
    if (!fields.success) return apiError(400, "Take the photo in the camera page.");
    const unknown = [...form.keys()].filter((key) => !ALLOWED.includes(key));
    if (unknown.length > 0) return apiError(400, "Take the photo in the camera page.");
    const lat = Number(fields.data.lat);
    const lng = Number(fields.data.lng);
    const accuracy = Number(fields.data.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
      return apiError(400, "Certa needs your location to prove the photos were taken on site. Turn on location and try again.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeCapturePhoto(db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      userId,
      stageId,
      nonce: fields.data.nonce,
      capturedAtMs: Number(fields.data.capturedAt),
      lat,
      lng,
      accuracyM: accuracy,
      deviceInfo: fields.data.deviceInfo ?? "mini-app",
      bytes,
      site: { lat: project.siteLat, lng: project.siteLng },
      radiusM: project.geofenceRadiusM,
    });
    return apiJson(
      captureOutput,
      {
        accepted: stored.accepted,
        trust: stored.accepted ? "high" : "rejected",
        reasons: [stored.message],
        message: stored.message,
        ...(stored.photoId ? { photoId: stored.photoId } : {}),
      },
      stored.accepted ? 200 : 422,
    );
  },
  { roles: ["contractor", "subcontractor"], assignedStage: true, upload: true },
);
