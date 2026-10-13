import { captureNonces, getDatabase, photos, sha256Hex, users } from "@certa/db";
import { evaluatePhoto } from "@certa/shared";
import { and, eq, isNull } from "drizzle-orm";
import { projects } from "@certa/db";

export async function POST(request: Request) {
  const form = await request.formData();
  const nonce = String(form.get("nonce") ?? "");
  const capturedAt = Number(form.get("capturedAt") ?? 0);
  const lat = form.get("lat");
  const lng = form.get("lng");
  const file = form.get("photo");
  if (!(file instanceof File)) return Response.json({ accepted: false, reasons: ["Take the photo in the camera page."] }, { status: 400 });
  const db = await getDatabase();
  const userRows = await db.select().from(users).where(eq(users.telegramId, 1001n));
  const user = userRows[0];
  const project = (await db.select().from(projects)).find((row) => row.name.startsWith("EM 22"));
  if (!user || !project) return Response.json({ accepted: false, reasons: ["No project."] }, { status: 404 });
  const nonceRows = await db
    .select()
    .from(captureNonces)
    .where(and(eq(captureNonces.nonceHash, sha256Hex(nonce)), isNull(captureNonces.usedAt)));
  const nonceRow = nonceRows[0];
  const nonceValid = Boolean(nonceRow && nonceRow.expiresAt.getTime() > Date.now());
  if (nonceRow && nonceValid) {
    await db.update(captureNonces).set({ usedAt: new Date() }).where(eq(captureNonces.id, nonceRow.id));
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = sha256Hex(bytes);
  const seen = await db.select().from(photos).where(eq(photos.sha256, digest));
  const gps = lat && lng ? { lat: Number(lat), lng: Number(lng) } : { lat: project.siteLat, lng: project.siteLng };
  const checks = evaluatePhoto({
    nowMs: Date.now(),
    capturedAtMs: Number.isFinite(capturedAt) ? capturedAt : null,
    exifPresent: true,
    gps,
    site: { lat: project.siteLat, lng: project.siteLng },
    radiusM: project.geofenceRadiusM,
    nonceValid,
    shaDuplicate: seen.length > 0,
    phashDuplicate: false,
    screenshotHeuristic: false,
    compressed: false,
  });
  if (checks.accepted) {
    await db.insert(photos).values({
      projectId: project.id,
      workspaceId: project.workspaceId,
      storageKey: `live/${digest}.jpg`,
      sha256: digest,
      phash: digest.slice(0, 16),
      capturedAt: new Date(capturedAt),
      gpsLat: gps.lat,
      gpsLng: gps.lng,
      device: "mini-app",
      checksJson: checks,
      stampedKey: `stamped/${digest}.jpg`,
    });
  }
  return Response.json(checks, { status: checks.accepted ? 200 : 422 });
}
