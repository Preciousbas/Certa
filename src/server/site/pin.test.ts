import { createMemoryDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { checkCapture } from "../verify/checks.js";
import { geocodeSite } from "./geocode.js";
import { manualPin, sitePin } from "./pin.js";

const now = Date.UTC(2026, 9, 22, 12, 0, 0);

describe("site pin", () => {
  it("treats 0,0 and a missing source as no pin", () => {
    expect(sitePin({ siteLat: 0, siteLng: 0, sitePinSource: "legacy" })).toBeNull();
    expect(sitePin({ siteLat: 6.4, siteLng: 3.4, sitePinSource: null })).toBeNull();
    expect(sitePin({ siteLat: 6.4, siteLng: 3.4, sitePinSource: "manual" })).toEqual({ lat: 6.4, lng: 3.4 });
  });

  it("geocodes a hit, a miss and a timeout without throwing", async () => {
    const hit = await geocodeSite("Lekki", async () => new Response(JSON.stringify([{ lat: "6.4", lon: "3.4", display_name: "Lekki, Lagos" }])));
    expect(hit?.label).toContain("Lekki");
    const miss = await geocodeSite("nowhere", async () => new Response("[]"));
    expect(miss).toBeNull();
    const timed = await geocodeSite("slow", async () => {
      throw new Error("timeout");
    });
    expect(timed).toBeNull();
  });

  it("warns off site and with no pin, and still refuses a duplicate", () => {
    const far = checkCapture({
      nowMs: now,
      capturedAtMs: now,
      nonceIssuedAtMs: now - 1000,
      nonceOk: true,
      point: { lat: 9, lng: 7 },
      accuracyM: 10,
      site: { lat: 6.4, lng: 3.4 },
      radiusM: 150,
      shaDuplicate: false,
      similarPhotoId: null,
      longSidePx: 2000,
      meanLuma: 40,
      laplacian: 40,
      exifPresent: false,
    });
    expect(far.ok).toBe(true);
    expect(far.checks.in_radius).toBe(false);
    expect(far.message).toContain("from the site pin");
    const unpinned = checkCapture({ ...{
      nowMs: now, capturedAtMs: now, nonceIssuedAtMs: now - 1000, nonceOk: true, point: { lat: 6.4, lng: 3.4 }, accuracyM: 10, radiusM: 150, shaDuplicate: false, similarPhotoId: null, longSidePx: 2000, meanLuma: 40, laplacian: 40, exifPresent: false,
    }, site: null });
    expect(unpinned.ok).toBe(true);
    expect(unpinned.checks.site_pin).toBe(false);
    const duplicate = checkCapture({
      nowMs: now, capturedAtMs: now, nonceIssuedAtMs: now - 1000, nonceOk: true, point: { lat: 6.4, lng: 3.4 }, accuracyM: 10, site: { lat: 6.4, lng: 3.4 }, radiusM: 150, shaDuplicate: true, similarPhotoId: null, longSidePx: 2000, meanLuma: 40, laplacian: 40, exifPresent: false,
    });
    expect(duplicate.ok).toBe(false);
  });

  it("does not save an empty latitude as zero", () => {
    expect(manualPin("", "3.4")).toBeNull();
    expect(manualPin("0", "0")).toBeNull();
    expect(manualPin("6.4", "3.4")).toEqual({ lat: 6.4, lng: 3.4 });
  });

  it("backfills a real coordinate as legacy and leaves 0,0 alone", async () => {
    const opened = await createMemoryDatabase();
    const { startOwnProject } = await import("@certa/db");
    const real = await startOwnProject(opened.db, { telegramId: 91n, name: "Ada", projectName: "Real", role: "client" });
    const zero = await startOwnProject(opened.db, { telegramId: 92n, name: "Kemfor", projectName: "Zero", role: "client" });
    await opened.db.update(projects).set({ siteLat: 6.4, siteLng: 3.4 }).where(eq(projects.id, real.projectId));
    await opened.client.exec(`UPDATE projects SET site_pin_source = 'legacy', site_pin_set_at = now() WHERE site_pin_source IS NULL AND NOT (site_lat = 0 AND site_lng = 0)`);
    const rows = await opened.db.select().from(projects);
    expect(rows.find((row) => row.id === real.projectId)?.sitePinSource).toBe("legacy");
    expect(rows.find((row) => row.id === zero.projectId)?.sitePinSource ?? null).toBeNull();
    await opened.close();
  });
});
