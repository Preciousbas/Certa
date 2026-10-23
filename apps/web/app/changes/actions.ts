"use server";

import { getDatabase } from "@certa/db";
import { VariationError, proposeVariation, type VariationType } from "../../../../src/server/changes/propose";
import { parseNaira } from "../../../../src/lib/money/kobo";
import { loadProject } from "../../lib/data";

export async function proposeChange(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const data = await loadProject();
  if (!data) return { ok: false, message: "No project is open." };
  const title = String(formData.get("title") ?? "");
  const description = String(formData.get("description") ?? "");
  const typeRaw = String(formData.get("type") ?? "add");
  const type: VariationType = typeRaw === "omit" || typeRaw === "alter" ? typeRaw : "add";
  const stageId = String(formData.get("stageId") ?? "new");
  let amount: bigint;
  try {
    amount = parseNaira(String(formData.get("amount") ?? ""));
  } catch {
    return { ok: false, message: "Type the amount in naira, for example 250000." };
  }
  try {
    const db = await getDatabase();
    const sent = await proposeVariation(db, {
      projectId: data.project.id,
      actorUserId: data.user.id,
      title,
      description,
      type,
      amountKobo: amount,
      stageId,
    });
    return { ok: true, message: `Sent to ${sent.otherName} for agreement. They have 72 hours to reply.` };
  } catch (error) {
    const message = error instanceof VariationError ? error.message : "The change was not sent.";
    return { ok: false, message };
  }
}
