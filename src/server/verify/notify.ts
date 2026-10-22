import { memberships, users, type Database } from "@certa/db";
import { and, eq, inArray } from "drizzle-orm";
import { formatNaira } from "../../lib/money/kobo.js";
import { notifyOnce, type TelegramSender } from "../intake/notify.js";
import type { VerifyNotice } from "./decide.js";
import { bullets } from "./messages.js";

type Person = { id: string; telegramId: bigint; name: string };

async function roleUsers(db: Database, projectId: string, role: string): Promise<Person[]> {
  const members = (
    await db.select().from(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.role, role), eq(memberships.status, "active")))
  ).map((row) => row.userId);
  if (members.length === 0) return [];
  const rows = await db.select().from(users).where(inArray(users.id, members));
  return rows.map((row) => ({ id: row.id, telegramId: row.telegramId, name: row.name }));
}

function textFor(notice: VerifyNotice, input: NoticeInput): string {
  const head = `Stage ${input.stageNumber} — ${input.stageName}`;
  if (notice === "B-VF-1") {
    return `📋 ${head} on ${input.projectName} passed Certa's check (${input.confidencePct}% sure).\n${bullets(input.reasons)}\nPlease certify or reject.`;
  }
  if (notice === "B-VF-2") {
    return `${head} passed Certa's photo check. Waiting for ${input.consultantName} to certify. You'll be asked to approve payment of ${input.amountLabel} next.`;
  }
  if (notice === "B-VF-3") return `✅ Your photos for stage ${input.stageNumber} passed the check. The consultant will now certify it.`;
  if (notice === "B-VF-4") {
    return `❌ Stage ${input.stageNumber} isn't ready for payment yet. The money stays locked.\nWhat's missing:\n${bullets(input.issues)}\nWhen it's done, send new photos.`;
  }
  if (notice === "B-VF-5") {
    return `I couldn't confirm stage ${input.stageNumber} from these photos. Please send more photos showing:\n${bullets(input.missingShots)}`;
  }
  if (notice === "B-VF-6") {
    return `${head}: Certa isn't sure (${input.confidencePct}%). The contractor has been asked for more photos. You can also review it yourself.`;
  }
  if (notice === "B-VF-7") {
    return `⚠️ Safety concern seen in photos for stage ${input.stageNumber} on ${input.projectName}: ${input.safetyFlags.join("; ")}. Please follow up on site.`;
  }
  return `${head} did not pass the photo check. The money stays locked.`;
}

function audience(notice: VerifyNotice): "consultant" | "client" | "contractor" | "consultant_client" {
  if (notice === "B-VF-1" || notice === "B-VF-6" || notice === "consultant_fyi") return "consultant";
  if (notice === "B-VF-2") return "client";
  if (notice === "B-VF-7") return "consultant_client";
  return "contractor";
}

export type NoticeInput = {
  projectId: string;
  projectName: string;
  submissionId: string;
  stageNumber: number;
  stageName: string;
  amountKobo: bigint;
  confidencePct: number;
  reasons: string[];
  issues: string[];
  missingShots: string[];
  safetyFlags: string[];
  consultantName: string;
  amountLabel: string;
};

export async function notifyVerdict(
  db: Database,
  notices: readonly VerifyNotice[],
  input: Omit<NoticeInput, "amountLabel" | "consultantName"> & { consultantName?: string },
  send?: TelegramSender,
): Promise<void> {
  const consultants = await roleUsers(db, input.projectId, "consultant");
  const clients = await roleUsers(db, input.projectId, "client");
  const contractors = [
    ...(await roleUsers(db, input.projectId, "contractor")),
    ...(await roleUsers(db, input.projectId, "subcontractor")),
  ];
  const filled: NoticeInput = {
    ...input,
    consultantName: input.consultantName || consultants[0]?.name || "the consultant",
    amountLabel: formatNaira(input.amountKobo),
  };
  for (const notice of notices) {
    const who = audience(notice);
    const people = who === "consultant" ? consultants : who === "client" ? clients : who === "consultant_client" ? [...consultants, ...clients] : contractors;
    const body = textFor(notice, filled);
    for (const person of people) {
      await notifyOnce(db, {
        userId: person.id,
        chatId: person.telegramId.toString(),
        kind: notice,
        dedupeKey: `${notice}:${input.submissionId}:${person.id}`,
        text: body,
        send,
      });
    }
  }
}
