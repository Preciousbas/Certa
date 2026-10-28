import {
  getActiveProjectId,
  loadPrincipal,
  setActiveProject,
  upsertTelegramUser,
  visibleProjectIds,
  type Database,
} from "@certa/db";
import { requireMember } from "../../../src/server/auth/rbac";
import { copy, formatMoneyPair, formatNgnFromKobo, formatOfficialRate, parseStartPayload, type OfficialRate } from "@certa/shared";
import { handleIncoming, toHtml, bGe2, bGe5, bUp9, type BotKeyboard, type Inbound } from "../../../src/bot/index.js";
import { randomUUID } from "node:crypto";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import { eq } from "drizzle-orm";
import { memberships, parties, projects, stages, users } from "@certa/db";
import { explorerTx, SEPOLIA_CHAIN_ID } from "../../../src/server/chain/networks.js";
import { bUp1 } from "../../../src/bot/messages.js";
import { uploadDoneKeyboard } from "../../../src/bot/keyboards.js";
import { awaitingProject, enqueueExtraction, ingestDocument, setAwaitingDocuments } from "../../../src/server/intake/flow.js";
import { gotFile, READING, telegramTooBig } from "../../../src/server/intake/messages.js";
import { filenameOf } from "./intake.js";
import { syncEscrowProject } from "./sync.js";

export type BotDeps = {
  db: Database;
  paidWeather?: () => Promise<string>;
  officialRate?: () => Promise<OfficialRate | null>;
  loadDocument?: (fileId: string) => Promise<Uint8Array>;
  apiFetch?: typeof fetch;
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

export function createBot(token: string, deps: BotDeps): Bot<Context> {
  const bot = new Bot<Context>(token, deps.apiFetch ? { client: { fetch: deps.apiFetch } } : undefined);
  const requestIds = new WeakMap<Context, string>();
  bot.use(async (ctx, next) => {
    requestIds.set(ctx, randomUUID().slice(0, 8));
    await next();
  });
  bot.use(limit({ timeFrame: 2_000, limit: 20, onLimitExceeded: async (ctx) => ctx.reply(copy.rateLimited) }));

  function toMarkup(keyboard?: BotKeyboard) {
    if (!keyboard || keyboard.length === 0) return undefined;
    if (keyboard.some((row) => row.some((button) => button.kind === "location"))) {
      const reply = new Keyboard();
      for (const row of keyboard) {
        for (const button of row) {
          if (button.kind === "location") reply.requestLocation(button.text);
          else reply.text(button.text);
        }
        reply.row();
      }
      return reply.resized().oneTime();
    }
    const markup = new InlineKeyboard();
    for (const row of keyboard) {
      for (const button of row) {
        if (button.kind === "callback") markup.text(button.text, button.data);
        else if (button.kind === "web_app") markup.webApp(button.text, button.url);
        else if (button.kind === "switch") markup.switchInline(button.text, button.query);
      }
      markup.row();
    }
    return markup;
  }

  function released(hash: string) {
    const txHash = /^0x[a-fA-F0-9]{64}$/.test(hash) ? hash : undefined;
    return { ok: true as const, txHash, explorerLink: txHash ? explorerTx(SEPOLIA_CHAIN_ID, txHash) : "pending" };
  }

  async function speak(ctx: Context, outbound: Awaited<ReturnType<typeof handleIncoming>>) {
    if (outbound.edit && ctx.callbackQuery) {
      await ctx.editMessageText(toHtml(outbound.edit.text), {
        parse_mode: "HTML",
        reply_markup: outbound.edit.keyboard?.some((row) => row.some((button) => button.kind === "location"))
          ? undefined
          : (toMarkup(outbound.edit.keyboard) as InlineKeyboard | undefined) ?? { inline_keyboard: [] },
      });
    }
    for (const message of outbound.messages) {
      await ctx.reply(toHtml(message.text), { parse_mode: "HTML", reply_markup: toMarkup(message.keyboard) });
    }
  }

  function person(ctx: Context): Inbound["from"] | null {
    if (!ctx.from) return null;
    return { id: ctx.from.id, firstName: ctx.from.first_name || "Telegram" };
  }

  async function runEngine(ctx: Context, inbound: Inbound) {
    const outbound = await handleIncoming(deps.db, inbound, {
      paidWeather: deps.paidWeather,
      release: async (input) => {
        try {
          const { releaseStageTx } = await import("../../../src/server/chain/flows.js");
          const tx = await releaseStageTx(deps.db, input);
          return released(tx.txHash ?? "");
        } catch (error) {
          return { ok: false as const, reason: error instanceof Error ? error.message : "The payment did not go through." };
        }
      },
    });
    await speak(ctx, outbound);
  }

  async function gate(ctx: Context, projectScoped: boolean): Promise<boolean> {
    const from = ctx.from;
    if (!from) return false;
    const user = await upsertTelegramUser(deps.db, BigInt(from.id), from.first_name || "Telegram");
    if (!projectScoped) return true;
    const row = await active(deps.db, BigInt(from.id));
    if (!row?.project) return true;
    try {
      await requireMember(row.project.id, undefined, { db: deps.db, userId: user.id });
      return true;
    } catch {
      await say(ctx, "You don't have permission to do this on this project.");
      return false;
    }
  }

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

  async function moneyLine(kobo: bigint, lockedRate: bigint): Promise<string> {
    if (!deps.officialRate) return formatMoneyPair(kobo, lockedRate);
    const rate = await deps.officialRate();
    if (!rate) return `${formatNgnFromKobo(kobo)}\nThe Central Bank rate is unavailable.`;
    return `${formatMoneyPair(kobo, rate.koboPerUsdc)}\n1 USDC is ${formatOfficialRate(rate)} at the Central Bank rate for ${rate.asOf}.`;
  }

  async function telegramFile(fileId: string): Promise<Uint8Array> {
    const remote = await bot.api.getFile(fileId);
    if (!remote.file_path) throw new Error("Telegram did not return the file.");
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${remote.file_path}`);
    if (!response.ok) throw new Error("The file could not be downloaded.");
    return new Uint8Array(await response.arrayBuffer());
  }

  bot.on("message:document", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const document = ctx.message?.document;
    const waiting = ctx.from ? await awaitingProject(deps.db, BigInt(ctx.from.id)) : null;
    if (waiting && document) {
      const name = filenameOf(document) ?? document.file_name ?? "file";
      if ((document.file_size ?? 0) > 20 * 1024 * 1024) {
        await ctx.reply(telegramTooBig(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "", waiting));
        return;
      }
      const row = await active(deps.db, BigInt(ctx.from?.id ?? 0));
      const project = (await deps.db.select().from(projects).where(eq(projects.id, waiting)))[0];
      if (!project || !row?.user) return;
      const bytes = deps.loadDocument ? await deps.loadDocument(document.file_id) : await telegramFile(document.file_id);
      const saved = await ingestDocument(deps.db, {
        projectId: project.id,
        workspaceId: project.workspaceId,
        userId: row.user.id,
        fileName: name,
        bytes,
      });
      const text = saved.ok ? gotFile(name, saved.pagesOrSheets) : saved.message;
      const duplicate = text.startsWith("You've already");
      await ctx.reply(text, duplicate ? undefined : { reply_markup: new InlineKeyboard().text("Retry", `v1:rx:${project.id}`) });
      return;
    }
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    const member = row?.project && row.user
      ? (await deps.db.select().from(memberships).where(eq(memberships.projectId, row.project.id))).find((item) => item.userId === row.user?.id && item.status === "active")
      : undefined;
    if (document && row?.project && row.user && (member?.role === "client" || member?.role === "consultant")) {
      await setAwaitingDocuments(deps.db, BigInt(ctx.from?.id ?? 0), row.project.id);
      const bytes = deps.loadDocument ? await deps.loadDocument(document.file_id) : await telegramFile(document.file_id);
      const saved = await ingestDocument(deps.db, {
        projectId: row.project.id,
        workspaceId: row.project.workspaceId,
        userId: row.user.id,
        fileName: filenameOf(document) ?? document.file_name ?? "file",
        bytes,
      });
      const text = saved.ok ? bUp1({ fileName: filenameOf(document) ?? document.file_name ?? "file", pagesOrSheets: saved.pagesOrSheets }) : saved.message;
      await ctx.reply(text, saved.ok ? { reply_markup: toMarkup(uploadDoneKeyboard()) } : undefined);
      return;
    }
    await ctx.reply("Start or open a project first.", { reply_markup: new InlineKeyboard().text("New project", "v1:go:create") });
  });

  bot.command("done", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "done", arg: "", from: who });
  });

  bot.callbackQuery("upload-boq", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    await ctx.answerCallbackQuery();
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project || !ctx.from) return;
    await setAwaitingDocuments(deps.db, BigInt(ctx.from.id), row.project.id);
    await ctx.reply("Send the contract or BoQ. Tap Done when you've sent everything.");
  });

  bot.on("message:photo", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const waiting = ctx.from ? await awaitingProject(deps.db, BigInt(ctx.from.id)) : null;
    const photo = ctx.message?.photo?.at(-1);
    if (!waiting || !photo || !ctx.from) return;
    if ((photo.file_size ?? 0) > 20 * 1024 * 1024) {
      await ctx.reply(telegramTooBig(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "", waiting));
      return;
    }
    const row = await active(deps.db, BigInt(ctx.from.id));
    const project = (await deps.db.select().from(projects).where(eq(projects.id, waiting)))[0];
    if (!project || !row?.user) return;
    const bytes = deps.loadDocument ? await deps.loadDocument(photo.file_id) : await telegramFile(photo.file_id);
    const saved = await ingestDocument(deps.db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      userId: row.user.id,
      fileName: "photo.jpg",
      bytes,
    });
    const text = saved.ok ? gotFile("photo.jpg", saved.pagesOrSheets) : saved.message;
    const duplicate = text.startsWith("You've already");
    await ctx.reply(text, duplicate ? undefined : { reply_markup: new InlineKeyboard().text("Retry", `v1:rx:${project.id}`) });
  });

  bot.command("start", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    await runEngine(ctx, { type: "command", command: "start", arg: payload, from: who });
  });

  bot.callbackQuery("go-start", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    await ctx.answerCallbackQuery();
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "callback", data: "v1:go:create", from: who });
  });

  bot.callbackQuery("go-join", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    await ctx.answerCallbackQuery();
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "callback", data: "v1:go:code", from: who });
  });

  bot.command("join", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    const code = typeof ctx.match === "string" ? ctx.match.trim() : "";
    await runEngine(ctx, { type: "command", command: "join", arg: code, from: who });
  });

  bot.command("accept", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "accept", arg: "", from: who });
  });

  bot.command("help", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "help", arg: "", from: who });
  });

  bot.command("project", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project) {
      await say(ctx, copy.noProjects);
      return;
    }
    await syncEscrowProject(deps.db, row.project).catch(() => undefined);
    const stageRows = await deps.db.select().from(stages).where(eq(stages.projectId, row.project.id));
    const done = stageRows.filter((stage) => stage.status === "released").length;
    await say(
      ctx,
      `${row.project.name}\n${await moneyLine(row.project.contractSumKobo, row.project.fxRateLocked)}\n${done} of ${stageRows.length} ${stageRows.length === 1 ? "stage" : "stages"} paid.`,
    );
  });

  bot.command("stages", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "stages", arg: "", from: who });
  });

  bot.command("switch", async (ctx) => {
    if (!(await gate(ctx, true))) return;
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
    if (!(await gate(ctx, true))) return;
    const projectId = ctx.callbackQuery.data.slice(3);
    if (!ctx.from) return;
    const user = await upsertTelegramUser(deps.db, BigInt(ctx.from.id), ctx.from.first_name);
    const ok = await setActiveProject(deps.db, BigInt(ctx.from.id), projectId, user.id);
    await ctx.answerCallbackQuery(ok ? copy.switched : copy.noProjects);
    if (ok) await say(ctx, copy.switched);
  });

  bot.command("submit", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "submit", arg: "", from: who });
  });

  bot.command("site", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "site", arg: "", from: who });
  });

  bot.command("wallet", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const who = person(ctx);
    if (!who) return;
    await runEngine(ctx, { type: "command", command: "wallet", arg: "", from: who });
  });

  bot.callbackQuery("adv", async (ctx) => {
    if (!(await gate(ctx, true))) return;
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
    if (!(await gate(ctx, true))) return;
    await say(ctx, `${copy.disputeLocked}\nTell us the stage and the reason in the app.`, "Dispute");
  });

  bot.command("changes", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    await say(ctx, "Open changes are in the app. A no needs a reason.", "Changes");
  });

  bot.command("report", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const weather = deps.paidWeather ? await deps.paidWeather() : "Weather check was not run.";
    await say(ctx, `Today's note is ready.\n${weather}`, "Report");
  });

  bot.command(["menu", "projects", "upload", "photos", "review", "fund", "cancel", "new", "newproject"], async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    const command = ctx.message?.text?.split(/\s|@/)[0]?.replace(/^\//, "") ?? "menu";
    await runEngine(ctx, { type: "command", command, arg: typeof ctx.match === "string" ? ctx.match.trim() : "", from: who });
  });

  bot.on("message:text", async (ctx, next) => {
    const who = person(ctx);
    const text = ctx.message?.text ?? "";
    if (!who) return next();
    if (text.startsWith("/")) {
      const command = text.split(/\s|@/)[0]?.replace(/^\//, "") ?? "";
      const known = new Set(["start", "join", "menu", "projects", "upload", "photos", "review", "fund", "cancel", "help", "wallet", "dispute", "changes", "report", "done", "new", "newproject"]);
      if (!known.has(command)) {
        await ctx.reply("I don't know that command. Send /menu or /help.");
        return;
      }
      return next();
    }
    const outbound = await handleIncoming(deps.db, { type: "text", text, from: who }, { paidWeather: deps.paidWeather });
    if (outbound.messages.length === 0 && !outbound.edit) return next();
    await speak(ctx, outbound);
  });

  bot.on("message:location", async (ctx, next) => {
    const who = person(ctx);
    const location = ctx.message?.location;
    if (!who || !location) return next();
    const outbound = await handleIncoming(
      deps.db,
      { type: "location", latitude: location.latitude, longitude: location.longitude, from: who },
      { paidWeather: deps.paidWeather },
    );
    if (outbound.messages.length === 0 && !outbound.edit) return next();
    await speak(ctx, outbound);
  });

  bot.callbackQuery(/^v1:/, async (ctx) => {
    const who = person(ctx);
    if (!who) return;
    const slow = /^v1:(ap|cf|rj|jn|dp|va|vd|rx)/.test(ctx.callbackQuery.data);
    const retry = ctx.callbackQuery.data.startsWith("v1:rx");
    if (!retry) {
      if (slow) await ctx.answerCallbackQuery({ text: bGe5() });
      else await ctx.answerCallbackQuery();
    }
    try {
      const outbound = await handleIncoming(deps.db, { type: "callback", data: ctx.callbackQuery.data, from: who }, {
        paidWeather: deps.paidWeather,
        release: async (input) => {
          try {
            const { releaseStageTx } = await import("../../../src/server/chain/flows.js");
            const tx = await releaseStageTx(deps.db, input);
            return released(tx.txHash ?? "");
          } catch (error) {
            return { ok: false as const, reason: error instanceof Error ? error.message : "The payment did not go through." };
          }
        },
      });
      if (retry) {
        const text = outbound.messages[0]?.text ?? "";
        if (text === bUp9()) {
          await ctx.answerCallbackQuery({ text: bUp9() });
          return;
        }
        await ctx.answerCallbackQuery({ text: bGe5() });
      }
      await speak(ctx, outbound);
    } catch (error) {
      if (retry) await ctx.answerCallbackQuery().catch(() => undefined);
      const requestId = requestIds.get(ctx) ?? "none";
      console.error(JSON.stringify({
        msg: "bot callback",
        requestId,
        err: error instanceof Error ? error.name : "error",
        message: error instanceof Error ? error.message : "",
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8).join("\n") : "",
      }));
      await ctx.reply(toHtml(bGe2({ requestId })), { parse_mode: "HTML" });
    }
  });

  bot.catch((error) => {
    const requestId = requestIds.get(error.ctx) ?? "none";
    const cause = error.error;
    console.error(JSON.stringify({
      msg: "bot error",
      requestId,
      err: error.name,
      message: cause instanceof Error ? cause.message : "",
      stack: cause instanceof Error ? cause.stack?.split("\n").slice(0, 8).join("\n") : "",
    }));
  });

  return bot;
}

export async function deliver(bot: Bot<Context>, update: Parameters<Bot<Context>["handleUpdate"]>[0], sent: string[]) {
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
  bot.api.config.use(harness as Parameters<Bot<Context>["api"]["config"]["use"]>[0]);
  await bot.init();
  await bot.handleUpdate(update);
}
