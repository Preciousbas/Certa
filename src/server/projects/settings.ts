import { projects, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { actionRoles, requireMember } from "../auth/rbac.js";
import { setProjectPaused } from "./pause.js";

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export async function updateProjectSettings(
  db: Database,
  input: {
    userId: string;
    projectId: string;
    radius: number;
    pin: { lat: number; lng: number } | null;
    disputeDays: number;
    replyHours: number;
  },
): Promise<void> {
  await requireMember(input.projectId, actionRoles("invite_settings_pause"), { db, userId: input.userId });
  const pin = input.pin
    ? { siteLat: input.pin.lat, siteLng: input.pin.lng, sitePinSource: "manual", sitePinSetAt: new Date() }
    : {};
  await db
    .update(projects)
    .set({
      geofenceRadiusM: clamp(input.radius, 25, 2000),
      ...pin,
      disputeTimeoutDays: clamp(input.disputeDays, 1, 90),
      changeReplyHours: clamp(input.replyHours, 1, 168),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));
}

export async function setProjectPausedAs(
  db: Database,
  input: { userId: string; projectId: string; paused: boolean },
): Promise<void> {
  await requireMember(input.projectId, actionRoles("invite_settings_pause"), { db, userId: input.userId });
  await setProjectPaused(db, input.projectId, input.paused);
}
