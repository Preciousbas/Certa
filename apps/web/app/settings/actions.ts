"use server";

import { getDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";
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
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));
  const disputeDays = clamp(Number(formData.get("disputeDays")), 1, 90);
  const replyHours = clamp(Number(formData.get("replyHours")), 1, 168);
  const db = await getDatabase();
  await db
    .update(projects)
    .set({
      geofenceRadiusM: radius,
      siteLat: Number.isFinite(lat) ? lat : data.project.siteLat,
      siteLng: Number.isFinite(lng) ? lng : data.project.siteLng,
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
