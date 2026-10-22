import { changeRequests, memberships, notifications, projects, stages, users, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { bVa2 } from "../../bot/messages.js";
import { notify } from "../../bot/notify.js";
import { formatNaira } from "../../lib/money/kobo.js";
import { usdcFromNgnKobo } from "@certa/shared";

export type VariationType = "add" | "omit" | "alter";

export type VariationInput = {
  projectId: string;
  actorUserId: string;
  title: string;
  description: string;
  type: VariationType;
  amountKobo: bigint;
  stageId: string;
};

export class VariationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariationError";
  }
}

function signedAmount(type: VariationType, amountKobo: bigint): bigint {
  if (type !== "omit") return amountKobo < 0n ? -amountKobo : amountKobo;
  return amountKobo > 0n ? -amountKobo : amountKobo;
}

export async function proposeVariation(
  db: Database,
  input: VariationInput,
): Promise<{ changeId: string; otherName: string }> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 5 || title.length > 80) throw new VariationError("Title must be 5 to 80 characters.");
  if (description.length < 20 || description.length > 1000) throw new VariationError("Describe the change in 20 to 1000 characters.");
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) throw new VariationError("That project is not available.");
  if (project.status === "paused") throw new VariationError("This project is paused.");
  const members = await db.select().from(memberships).where(eq(memberships.projectId, project.id));
  const actor = members.find((row) => row.userId === input.actorUserId && row.status === "active");
  if (!actor || (actor.role !== "client" && actor.role !== "contractor")) {
    throw new VariationError("Only the client or the contractor can propose a change.");
  }
  const otherRole = actor.role === "client" ? "contractor" : "client";
  const others = members.filter((row) => row.role === otherRole && row.status === "active");
  const otherUsers = others.length
    ? await db.select().from(users).where(eq(users.id, others[0]!.userId))
    : [];
  const other = otherUsers[0];
  if (!other) throw new VariationError("The other party has not joined yet.");
  const amount = signedAmount(input.type, input.amountKobo);
  const actorUser = (await db.select().from(users).where(eq(users.id, input.actorUserId)))[0];
  const [row] = await db
    .insert(changeRequests)
    .values({
      projectId: project.id,
      workspaceId: project.workspaceId,
      type: input.type,
      beforeJson: {},
      afterJson: {
        title,
        description,
        amountKobo: amount.toString(),
        stageId: input.stageId,
      },
      requestedBy: input.actorUserId,
      status: "pending",
    })
    .returning();
  if (!row) throw new VariationError("The change was not saved.");
  const note = bVa2({
    name: actorUser?.name ?? "Someone",
    project: project.name,
    title,
    amount: formatNaira(amount < 0n ? -amount : amount),
  });
  for (const person of others) {
    const user = (await db.select().from(users).where(eq(users.id, person.userId)))[0];
    if (!user) continue;
    await notify(db, {
      userId: user.id,
      messageId: "B-VA-2",
      text: note,
      dedupeKey: `bva2:${row.id}:${user.id}`,
      chatId: user.telegramId.toString(),
    });
  }
  return { changeId: row.id, otherName: other.name };
}

export async function decideVariation(
  db: Database,
  input: { projectId: string; changeId: string; actorUserId: string; accept: boolean; reason?: string },
): Promise<void> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  const change = (await db.select().from(changeRequests).where(eq(changeRequests.id, input.changeId)))[0];
  if (!project || !change || change.projectId !== project.id || change.status !== "pending") {
    throw new VariationError("That change is not waiting on you.");
  }
  if (change.requestedBy === input.actorUserId) throw new VariationError("That change is not waiting on you.");
  if (!input.accept && !(input.reason && input.reason.trim().length > 0)) {
    throw new VariationError("A no needs a reason.");
  }
  if (!input.accept) {
    await db
      .update(changeRequests)
      .set({ status: "declined", reason: input.reason?.trim() ?? "", respondedAt: new Date() })
      .where(eq(changeRequests.id, change.id));
    return;
  }
  const after = change.afterJson as { title?: string; amountKobo?: string; stageId?: string };
  const delta = BigInt(after.amountKobo ?? "0");
  const title = after.title ?? "Change";
  await db.update(changeRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(changeRequests.id, change.id));
  if (after.stageId && after.stageId !== "new") {
    const stage = (await db.select().from(stages).where(eq(stages.id, after.stageId)))[0];
    if (!stage) return;
    const next = change.type === "omit" ? (stage.amountNgnKobo + delta < 0n ? 0n : stage.amountNgnKobo + delta) : delta < 0n ? -delta : delta;
    const usdc = project.fxRateLocked > 0n ? usdcFromNgnKobo(next, project.fxRateLocked) : stage.amountUsdc;
    await db.update(stages).set({ amountNgnKobo: next, amountUsdc: usdc, name: change.type === "alter" ? title : stage.name }).where(eq(stages.id, stage.id));
    return;
  }
  const existing = await db.select().from(stages).where(eq(stages.projectId, project.id));
  const index = existing.length;
  const amount = delta < 0n ? -delta : delta;
  const usdc = project.fxRateLocked > 0n ? usdcFromNgnKobo(amount, project.fxRateLocked) : 0n;
  await db.insert(stages).values({
    projectId: project.id,
    workspaceId: project.workspaceId,
    stageIndex: index,
    name: title,
    amountNgnKobo: amount,
    amountUsdc: usdc,
    retentionBps: project.retentionBps,
    onChainIdx: index,
  });
}

export async function queuedNotice(db: Database, changeId: string): Promise<string | undefined> {
  const rows = await db.select().from(notifications);
  return rows.find((row) => row.dedupeKey.includes(changeId) && row.kind === "B-VA-2")?.kind;
}
