import { memberships, users, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { formatNaira } from "../lib/money/kobo.js";
import { bFu2, bFu3, bFu4 } from "./messages.js";
import { notify } from "./notify.js";

export async function notifyFundOutcome(
  db: Database,
  input: {
    outcome: "confirmed" | "failed";
    projectId: string;
    projectName: string;
    clientUserId: string;
    clientName: string;
    amountKobo: bigint;
    fromStage: number;
    toStage: number;
    explorerLink: string;
    plainReason: string;
    supportEmail: string;
    idempotencyKey: string;
  },
): Promise<{ contractorNotified: boolean }> {
  if (input.outcome === "failed") {
    await notify(db, {
      userId: input.clientUserId,
      messageId: "B-FU-4",
      text: bFu4({ plainReason: input.plainReason, supportEmail: input.supportEmail }),
      dedupeKey: `bfu4:${input.idempotencyKey}`,
    });
    return { contractorNotified: false };
  }
  const amount = formatNaira(input.amountKobo);
  await notify(db, {
    userId: input.clientUserId,
    messageId: "B-FU-2",
    text: bFu2({ amount, from: input.fromStage, to: input.toStage, explorerLink: input.explorerLink }),
    dedupeKey: `bfu2:${input.idempotencyKey}`,
  });
  const contractors = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.projectId, input.projectId), eq(memberships.role, "contractor"), eq(memberships.status, "active")));
  const client = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.clientUserId)))[0];
  const clientName = client?.name || input.clientName;
  for (const contractor of contractors) {
    await notify(db, {
      userId: contractor.userId,
      messageId: "B-FU-3",
      text: bFu3({ client: clientName, amount, from: input.fromStage, to: input.toStage }),
      dedupeKey: `bfu3:${input.idempotencyKey}:${contractor.userId}`,
    });
  }
  return { contractorNotified: contractors.length > 0 };
}
