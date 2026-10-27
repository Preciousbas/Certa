"use server";

import { getDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { manualPin } from "../../../../src/server/site/pin";
import { setProjectPaused } from "../../../../src/server/projects/pause";
import { loadProject } from "../../lib/data";

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export async function saveSettings(formData: FormData): Promise<{ message: string }> {
  const data = await loadProject();
  if (!data) return { message: "No project is open." };
  const radius = clamp(Number(formData.get("radius")), 25, 2000);
  const chosen = manualPin(String(formData.get("lat") ?? ""), String(formData.get("lng") ?? ""));
  const pin = chosen ? { siteLat: chosen.lat, siteLng: chosen.lng, sitePinSource: "manual", sitePinSetAt: new Date() } : {};
  const disputeDays = clamp(Number(formData.get("disputeDays")), 1, 90);
  const replyHours = clamp(Number(formData.get("replyHours")), 1, 168);
  const db = await getDatabase();
  await db
    .update(projects)
    .set({
      geofenceRadiusM: radius,
      ...pin,
      disputeTimeoutDays: disputeDays,
      changeReplyHours: replyHours,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, data.project.id));
  if (formData.get("letterhead")) {
    return { message: "Saved. Letterhead upload needs storage before a file can be kept." };
  }
  return { message: "Saved." };
}

export async function setPaused(paused: boolean): Promise<{ message: string }> {
  const data = await loadProject();
  if (!data) return { message: "No project is open." };
  const db = await getDatabase();
  await setProjectPaused(db, data.project.id, paused);
  return { message: paused ? "This project is paused." : "The project is active again." };
}
