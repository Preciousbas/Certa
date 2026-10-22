import { memberships, users, type Database } from "@certa/db";
import { and, eq, inArray } from "drizzle-orm";
import { formatNaira } from "../../lib/money/kobo.js";
import { bVf1, bVf2, bVf3, bVf4, bVf5, bVf6, bVf7, bullets } from "../../bot/messages.js";
import { certifyKeyboard, morePhotosKeyboard, retryPhotosKeyboard, reviewNowKeyboard, type BotKeyboard } from "../../bot/keyboards.js";
import { notify } from "../../bot/notify.js";
import type { VerifyNotice } from "./decide.js";

type Person = { id: string; telegramId: bigint; name: string };

async function roleUsers(db: Database, projectId: string, role: string): Promise<Person[]> {
  const members = (
    await db.select().from(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.role, role), eq(memberships.status, "active")))
  ).map((row) => row.userId);
  if (members.length === 0) return [];
  const rows = await db.select().from(users).where(inArray(users.id, members));
  return rows.map((row) => ({ id: row.id, telegramId: row.telegramId, name: row.name }));
}

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function textFor(notice: VerifyNotice, input: NoticeInput): { text: string; keyboard?: BotKeyboard } {
  const reasons = bullets(input.reasons);
  const issues = bullets(input.issues);
  const missing = bullets(input.missingShots);
  if (notice === "B-VF-1") {
    return {
      text: bVf1({ n: input.stageNumber, stage: input.stageName, project: input.projectName, confidence: input.confidencePct, reasonsBullets: reasons }),
      keyboard: certifyKeyboard(appUrl(), input.stageId),
    };
  }
  if (notice === "B-VF-2") {
    return { text: bVf2({ n: input.stageNumber, stage: input.stageName, consultant: input.consultantName, amount: input.amountLabel }) };
  }
  if (notice === "B-VF-3") return { text: bVf3({ n: input.stageNumber }) };
  if (notice === "B-VF-4") {
    return { text: bVf4({ n: input.stageNumber, issuesBullets: issues }), keyboard: retryPhotosKeyboard(input.stageId) };
  }
  if (notice === "B-VF-5") {
    return { text: bVf5({ n: input.stageNumber, missingShotsBullets: missing }), keyboard: morePhotosKeyboard(input.stageId) };
  }
  if (notice === "B-VF-6") {
    return {
      text: bVf6({ n: input.stageNumber, stage: input.stageName, confidence: input.confidencePct }),
      keyboard: reviewNowKeyboard(appUrl(), input.stageId),
    };
  }
  if (notice === "B-VF-7") {
    return { text: bVf7({ n: input.stageNumber, project: input.projectName, flags: input.safetyFlags.join("; ") }) };
  }
  return { text: `Stage ${input.stageNumber} — ${input.stageName} did not pass the photo check. The money stays locked.` };
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
  stageId: string;
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
      await notify(db, {
        userId: person.id,
        chatId: person.telegramId.toString(),
        messageId: notice,
        dedupeKey: `${notice}:${input.submissionId}:${person.id}`,
        text: body.text,
        keyboard: body.keyboard,
      });
    }
  }
}
