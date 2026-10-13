import {
  getActiveProjectId,
  loadPrincipal,
  redeemJoinCode,
  setActiveProject,
  upsertTelegramUser,
  visibleProjectIds,
  type Database,
} from "@certa/db";
import { copy, formatMoneyPair } from "@certa/shared";
import { conversations, createConversation, type ConversationFlavor } from "@grammyjs/conversations";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from "grammy";
import { eq } from "drizzle-orm";
import { parties, projects, stages, users } from "@certa/db";

type SessionData = { pending?: string };
type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;

export type BotDeps = {
  db: Database;
  paidWeather?: () => Promise<string>;
};

function shortSite(name: string, location: string): string {
  const head = name.split("—")[0]?.trim() || name;
  const place = location.split(",")[0]?.trim() || location;
  return `${head}, ${place}`;
}

async function active(db: Database, telegramId: bigint) {
  const userRows = await db.select().from(users).where(eq(users.telegramId, telegramId));
  const user = userRows[0];
  if (!user) return null;
  const visible = await visibleProjectIds(db, user.id);
  const current = await getActiveProjectId(db, telegramId);
  const projectId = current && visible.includes(current) ? current : visible[0];
  if (!projectId) return { user, project: null, visible };
  const projectRows = await db.select().from(projects).where(eq(projects.id, projectId));
  return { user, project: projectRows[0] ?? null, visible };
}

export function createBot(token: string, deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());
  bot.use(limit({ timeFrame: 2_000, limit: 20, onLimitExceeded: async (ctx) => ctx.reply(copy.rateLimited) }));

  async function header(ctx: Context, stage = "Overview"): Promise<string> {
    const from = ctx.from?.id;
    if (!from) return "";
    const row = await active(deps.db, BigInt(from));
    if (!row?.project) return "";
    return copy.header(shortSite(row.project.name, row.project.siteLocation), stage);
  }

  async function say(ctx: Context, text: string, stage = "Overview", markup?: InlineKeyboard) {
    const top = await header(ctx, stage);
    await ctx.reply(top ? `${top}\n${text}` : text, markup ? { reply_markup: markup } : undefined);
  }

  async function joinWithCode(ctx: Context, code: string) {
    const from = ctx.from;
    if (!from) return;
    const result = await redeemJoinCode(deps.db, { telegramId: BigInt(from.id), name: from.first_name, code });
    if (!result.ok) {
      await say(ctx, result.reason === "rate_limited" ? copy.rateLimited : result.reason === "expired" ? copy.expiredCode : copy.invalidCode);
      return;
    }
    await say(ctx, copy.paymentAccountReady);
  }

  async function joinConversation(conversation: { waitFor: (filter: "message:text") => Promise<{ message?: { text?: string } }> }, ctx: Context) {
    await ctx.reply(copy.startJoin);
    const next = await conversation.waitFor("message:text");
    await joinWithCode(ctx, next.message?.text?.trim() ?? "");
  }
  bot.use(createConversation(joinConversation as Parameters<typeof createConversation>[0], "join"));

  bot.command("start", async (ctx) => {
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (payload.startsWith("join_")) {
      await joinWithCode(ctx, payload.slice(5));
      return;
    }
    const keyboard = new InlineKeyboard().text("Join a project", "go-join").text("Stages", "go-stages");
    await say(ctx, `${copy.start}\n\n${copy.startClient}`);
    await ctx.reply("Choose one.", { reply_markup: keyboard });
  });

  bot.callbackQuery("go-join", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("joinConversation");
  });

  bot.command("join", async (ctx) => {
    const code = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!code) {
      await ctx.conversation.enter("joinConversation");
      return;
    }
    await joinWithCode(ctx, code);
  });

  bot.command("help", async (ctx) => {
    await say(ctx, "/project  /stages  /submit  /switch  /join  /wallet  /dispute  /changes  /report");
  });

  bot.command("project", async (ctx) => {
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project) {
      await say(ctx, copy.noProjects);
      return;
    }
    const stageRows = await deps.db.select().from(stages).where(eq(stages.projectId, row.project.id));
    const done = stageRows.filter((stage) => stage.status === "released").length;
    await say(
      ctx,
      `${row.project.name}\n${formatMoneyPair(row.project.contractSumKobo, row.project.fxRateLocked)}\n${done} of ${stageRows.length} stages paid.`,
    );
  });

  bot.command("stages", async (ctx) => {
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project) {
      await say(ctx, copy.noProjects, "Stages");
      return;
    }
    const stageRows = await deps.db.select().from(stages).where(eq(stages.projectId, row.project.id));
    const lines = stageRows
      .sort((a, b) => a.stageIndex - b.stageIndex)
      .map((stage) => `${stage.stageIndex + 1}. ${stage.name} — ${stage.status}`);
    await say(ctx, lines.join("\n"), "Stages");
  });

  bot.command("switch", async (ctx) => {
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row || row.visible.length === 0) {
      await say(ctx, copy.noProjects);
      return;
    }
    const keyboard = new InlineKeyboard();
    const names: string[] = [];
    for (const id of row.visible) {
      const found = await deps.db.select().from(projects).where(eq(projects.id, id));
      const project = found[0];
      if (!project) continue;
      names.push(project.name);
      keyboard.text(shortSite(project.name, project.siteLocation), `sw:${id}`).row();
    }
    await say(ctx, names.join("\n"));
    await ctx.reply("Switch project.", { reply_markup: keyboard });
  });

  bot.callbackQuery(/^sw:/, async (ctx) => {
    const projectId = ctx.callbackQuery.data.slice(3);
    if (!ctx.from) return;
    const user = await upsertTelegramUser(deps.db, BigInt(ctx.from.id), ctx.from.first_name);
    const ok = await setActiveProject(deps.db, BigInt(ctx.from.id), projectId, user.id);
    await ctx.answerCallbackQuery(ok ? copy.switched : copy.noProjects);
    if (ok) await say(ctx, copy.switched);
  });

  bot.command("submit", async (ctx) => {
    const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await say(ctx, `Take the photo in the camera page.\n${url}/capture`, "Submit");
  });

  bot.command("wallet", async (ctx) => {
    const keyboard = new InlineKeyboard().text("Advanced", "adv");
    await say(ctx, copy.paymentAccountReady, "Payment account", keyboard);
  });

  bot.callbackQuery("adv", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const row = await active(deps.db, BigInt(ctx.from.id));
    if (!row?.user || !row.project) {
      await say(ctx, copy.noProjects, "Payment account");
      return;
    }
    const partyRows = await deps.db.select().from(parties).where(eq(parties.userId, row.user.id));
    const party = partyRows.find((item) => item.projectId === row.project?.id);
    const principal = await loadPrincipal(deps.db, row.user.id);
    if (!party || principal.parties.length === 0) {
      await say(ctx, copy.noProjects, "Payment account");
      return;
    }
    await say(ctx, `${copy.paymentAccountAdvanced}\n${party.walletAddress ?? "Not created yet."}`, "Payment account");
  });

  bot.command("dispute", async (ctx) => {
    await say(ctx, `${copy.disputeLocked}\nTell us the stage and the reason in the app.`, "Dispute");
  });

  bot.command("changes", async (ctx) => {
    await say(ctx, "Open changes are in the app. A no needs a reason.", "Changes");
  });

  bot.command("report", async (ctx) => {
    const weather = deps.paidWeather ? await deps.paidWeather() : "Weather check was not run.";
    await say(ctx, `Today's note is ready.\n${weather}`, "Report");
  });

  bot.catch((error) => {
    console.error(JSON.stringify({ msg: "bot error", err: String(error) }));
  });

  return bot;
}

export async function deliver(bot: Bot<BotContext>, update: Parameters<Bot<BotContext>["handleUpdate"]>[0], sent: string[]) {
  const harness = async (_prev: unknown, method: string, payload: unknown) => {
    const record = payload as { text?: string };
    if (method === "sendMessage" && record.text) sent.push(record.text);
    if (method === "getMe") {
      return { ok: true as const, result: { id: 1, is_bot: true as const, first_name: "Certa", username: "certa_bot" } };
    }
    return {
      ok: true as const,
      result: method === "answerCallbackQuery" ? true : { message_id: sent.length + 1, date: 1, chat: { id: 1, type: "private" as const, first_name: "Ada" }, text: record.text ?? "" },
    };
  };
  bot.api.config.use(harness as Parameters<Bot<BotContext>["api"]["config"]["use"]>[0]);
  await bot.init();
  await bot.handleUpdate(update);
}
