import { memberships, projects, stages, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { bWx1, bWx2, bWx3 } from "../../bot/messages.js";
import { notify } from "../../bot/notify.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { paidFetch, PaymentRefused, type PaidSuccess } from "./agent.js";
import { canPay, maxPerCallMicro, prePourDedupeKey, stageNeedsWeather, WEATHER_PRICE_MICRO } from "./gate.js";
import { allowanceState, recentWeatherSpend } from "./ledger.js";

export async function enqueuePrePour(
  db: Database,
  input: { projectId: string; stageId: string },
  now = Date.now(),
) {
  return enqueueJob(db, {
    kind: "pre_pour_check",
    payload: { projectId: input.projectId, stageId: input.stageId },
    dedupeKey: prePourDedupeKey(input.stageId, now),
  });
}

async function tell(
  db: Database,
  input: { projectId: string; stageId: string; text: string; messageId: string },
): Promise<void> {
  const people = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, input.projectId), eq(memberships.status, "active")));
  const bucket = prePourDedupeKey(input.stageId);
  for (const person of people) {
    if (person.role !== "contractor" && person.role !== "consultant") continue;
    await notify(db, {
      userId: person.userId,
      messageId: input.messageId,
      text: input.text,
      dedupeKey: `${input.messageId}:${bucket}:${person.userId}`,
    });
  }
}

function successText(input: { project: string; stage: string; paid: PaidSuccess }): string {
  if (input.paid.rainExpected) {
    return bWx2({ project: input.project, pct: input.paid.pct, mm: input.paid.mm, usdc: input.paid.usdc });
  }
  return bWx1({ project: input.project, stage: input.stage, pct: input.paid.pct, usdc: input.paid.usdc });
}

export async function runPrePourCheck(
  db: Database,
  input: { projectId: string; stageId: string; origin: string },
  deps?: { pay?: typeof paidFetch },
): Promise<"deduped" | "sent" | "failed"> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  const stage = (await db.select().from(stages).where(eq(stages.id, input.stageId)))[0];
  if (!project || !stage || stage.projectId !== project.id) return "failed";
  if (!stageNeedsWeather(stage)) return "deduped";
  if (await recentWeatherSpend(db, stage.id)) return "deduped";
  const state = await allowanceState(db, project.id);
  const decision = canPay({
    priceMicro: WEATHER_PRICE_MICRO,
    allowanceLeft: state?.left ?? 0n,
    maxPerCall: maxPerCallMicro(),
  });
  if (!state || !decision.ok) {
    await tell(db, {
      projectId: project.id,
      stageId: stage.id,
      text: bWx3({ project: project.name, plainReason: decision.ok ? "this project is not open" : decision.reason }),
      messageId: "B-WX-3",
    });
    return "failed";
  }
  const pay = deps?.pay ?? paidFetch;
  const url = new URL("/api/paid/weather", input.origin);
  url.searchParams.set("lat", String(project.siteLat));
  url.searchParams.set("lng", String(project.siteLng));
  url.searchParams.set("hours", "48");
  try {
    const paid = await pay(url.toString(), { projectId: project.id, stageId: stage.id, purpose: "weather_check" });
    const text = successText({ project: project.name, stage: stage.name, paid });
    await tell(db, {
      projectId: project.id,
      stageId: stage.id,
      text,
      messageId: paid.rainExpected ? "B-WX-2" : "B-WX-1",
    });
    return "sent";
  } catch (error) {
    const reason = error instanceof PaymentRefused ? error.plainReason : "the payment did not settle";
    await tell(db, {
      projectId: project.id,
      stageId: stage.id,
      text: bWx3({ project: project.name, plainReason: reason }),
      messageId: "B-WX-3",
    });
    if (error instanceof PaymentRefused && error.permanent) return "failed";
    throw error;
  }
}
