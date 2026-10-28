"use server";

import { getDatabase } from "@certa/db";
import { AuthError } from "../../../../src/server/auth/errors";
import { manualPin } from "../../../../src/server/site/pin";
import { setProjectPausedAs, updateProjectSettings } from "../../../../src/server/projects/settings";
import { loadProject } from "../../lib/data";
import { signedInUserId } from "../../lib/session-user";

export async function saveSettings(formData: FormData): Promise<{ message: string }> {
  const userId = await signedInUserId();
  if (!userId) return { message: "Sign in from Telegram." };
  const data = await loadProject();
  if (!data) return { message: "No project is open." };
  const db = await getDatabase();
  try {
    await updateProjectSettings(db, {
      userId,
      projectId: data.project.id,
      radius: Number(formData.get("radius")),
      pin: manualPin(String(formData.get("lat") ?? ""), String(formData.get("lng") ?? "")),
      disputeDays: Number(formData.get("disputeDays")),
      replyHours: Number(formData.get("replyHours")),
    });
  } catch (error) {
    if (error instanceof AuthError) return { message: error.message };
    throw error;
  }
  if (formData.get("letterhead")) {
    return { message: "Saved. Letterhead upload needs storage before a file can be kept." };
  }
  return { message: "Saved." };
}

export async function setPaused(paused: boolean): Promise<{ message: string }> {
  const userId = await signedInUserId();
  if (!userId) return { message: "Sign in from Telegram." };
  const data = await loadProject();
  if (!data) return { message: "No project is open." };
  const db = await getDatabase();
  try {
    await setProjectPausedAs(db, { userId, projectId: data.project.id, paused });
  } catch (error) {
    if (error instanceof AuthError) return { message: error.message };
    throw error;
  }
  return { message: paused ? "This project is paused." : "The project is active again." };
}
