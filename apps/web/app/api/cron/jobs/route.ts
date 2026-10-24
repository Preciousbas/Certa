import { createBot } from "@certa/bot";
import { getDatabase } from "@certa/db";
import { webhookCallback } from "grammy";
import { setTelegramUpdateDispatch } from "../../../../../../src/server/jobs/telegramUpdate";
import { registerIntakeJobs } from "../../../../../../src/server/intake/register";
import { registerChainJobs } from "../../../../../../src/server/chain/register";
import { registerVerifyJobs } from "../../../../../../src/server/verify/register";
import { registerNotifyJobs } from "../../../../../../src/bot/notify";
import { registerX402Jobs } from "../../../../../../src/server/x402/register";
import { registerReleaseRetry } from "../../../../../../src/bot/releaseRetry";
import { enqueueJob } from "../../../../../../src/server/jobs/enqueue";
import { drainJobs } from "../../../../../../src/server/jobs/worker";
import { fetchCbnRate } from "../../../../lib/cbn-rate";
import { requireCronSecret } from "../../../../lib/cron-auth";
import { apiError, emptyQuery, queryOf } from "../../../../lib/schemas";

registerIntakeJobs();
registerChainJobs();
registerVerifyJobs();
registerNotifyJobs();
registerReleaseRetry();
registerX402Jobs();

setTelegramUpdateDispatch(async (update) => {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) throw new Error("Telegram bot token is not configured.");
  const db = await getDatabase();
  const bot = createBot(token, { db, officialRate: fetchCbnRate });
  const replay = new Request("http://localhost/api/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  await webhookCallback(bot, "std/http")(replay);
});

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const db = await getDatabase();
  const slot = Math.floor(Date.now() / 600_000);
  await enqueueJob(db, { kind: "reconcile_open", dedupeKey: `reconcile-open:${slot}` });
  // drainJobs marks a telegram.update older than 10 minutes as skipped and does not replay it.
  const result = await drainJobs(20);
  return Response.json({ ok: true, ...result });
}
