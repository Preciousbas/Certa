import { agentRouterContract, studyUpload, type ParsedContract } from "@certa/ai";
import { createPartyWallet } from "@certa/chain";
import { getOrCreateWallet } from "../../../src/server/chain/wallets.js";
import {
  acceptContractSide,
  ensureWallet,
  getActiveProjectId,
  loadPrincipal,
  recordUploadedContract,
  redeemJoinCode,
  startOwnProject,
  type ContractSide,
  setActiveProject,
  sha256Hex,
  upsertTelegramUser,
  visibleProjectIds,
  type Database,
} from "@certa/db";
import { requireMember } from "../../../src/server/auth/rbac";
import { sideLabel } from "../../../src/server/projects/selfServe";
import { copy, formatMoneyPair, formatNgnFromKobo, formatOfficialRate, joinDeepLink, parseStartPayload, type OfficialRate } from "@certa/shared";
import { handleIncoming, toHtml, bGe2, bGe5, type BotKeyboard, type Inbound } from "../../../src/bot/index.js";
import { randomUUID } from "node:crypto";
import { conversations, createConversation, type ConversationFlavor } from "@grammyjs/conversations";
import { limit } from "@grammyjs/ratelimiter";
import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from "grammy";
import { eq } from "drizzle-orm";
import { parties, projects, stages, users } from "@certa/db";
import { awaitingProject, enqueueExtraction, ingestDocument, setAwaitingDocuments } from "../../../src/server/intake/flow.js";
import { gotFile, READING, telegramTooBig } from "../../../src/server/intake/messages.js";
import { applyGapAnswer, contractGaps, contractNote, filenameOf, MAX_CONTRACT_STAGES, readFailure, savedContractMessage } from "./intake.js";
import { syncEscrowProject } from "./sync.js";

const MAX_CONTRACT_BYTES = 8_000_000;

type SessionData = { pending?: string };
type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor<Context>;

export type BotDeps = {
  db: Database;
  paidWeather?: () => Promise<string>;
  officialRate?: () => Promise<OfficialRate | null>;
  loadDocument?: (fileId: string) => Promise<Uint8Array>;
  studyContract?: (filename: string, bytes: Uint8Array) => Promise<ParsedContract>;
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

export function createBot(token: string, deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(token, deps.apiFetch ? { client: { fetch: deps.apiFetch } } : undefined);
  const requestIds = new WeakMap<Context, string>();
  bot.use(async (ctx, next) => {
    requestIds.set(ctx, randomUUID().slice(0, 8));
    await next();
  });
  bot.use(session({ initial: (): SessionData => ({}) }));
  bot.use(conversations());
  bot.use(limit({ timeFrame: 2_000, limit: 20, onLimitExceeded: async (ctx) => ctx.reply(copy.rateLimited) }));

  function toMarkup(keyboard?: BotKeyboard) {
    if (!keyboard || keyboard.length === 0) return undefined;
    const markup = new InlineKeyboard();
    for (const row of keyboard) {
      for (const button of row) {
        if (button.kind === "callback") markup.text(button.text, button.data);
        else if (button.kind === "web_app") markup.webApp(button.text, button.url);
        else markup.switchInline(button.text, button.query);
      }
      markup.row();
    }
    return markup;
  }

  async function speak(ctx: Context, outbound: Awaited<ReturnType<typeof handleIncoming>>) {
    if (outbound.edit && ctx.callbackQuery) {
      await ctx.editMessageText(toHtml(outbound.edit.text), {
        parse_mode: "HTML",
        reply_markup: toMarkup(outbound.edit.keyboard) ?? { inline_keyboard: [] },
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
          const hash = tx.txHash ?? "";
          return { ok: true as const, explorerLink: hash ? `https://sepolia.etherscan.io/tx/${hash}` : "pending" };
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

  async function joinWithCode(ctx: Context, code: string) {
    const from = ctx.from;
    if (!from) return;
    const result = await redeemJoinCode(deps.db, { telegramId: BigInt(from.id), name: from.first_name, code });
    if (!result.ok) {
      const text =
        result.reason === "rate_limited"
          ? copy.rateLimited
          : result.reason === "expired"
            ? copy.expiredCode
            : result.reason === "revoked"
              ? "That invite was revoked."
              : result.reason === "taken"
                ? "That side of the contract is already taken."
                : copy.invalidCode;
      await say(ctx, text);
      return;
    }
    const joined = `You've joined ${result.projectName} as the ${sideLabel(result.role)}.`;
    try {
      const party = (await deps.db.select().from(parties).where(eq(parties.id, result.partyId)))[0];
      const purpose =
        result.role === "client" || result.role === "consultant" || result.role === "contractor" || result.role === "subcontractor"
          ? result.role
          : null;
      await ensureWallet(deps.db, result.partyId, async () => {
        if (!party || !purpose) return createPartyWallet(result.partyId);
        const wallet = await getOrCreateWallet(deps.db, { purpose, userId: party.userId, projectId: result.projectId });
        return { address: wallet.address, walletId: wallet.accountRef, mock: wallet.mock };
      });
    } catch {
      await say(ctx, `${joined} The payment account could not be created.`);
      return;
    }
    await say(ctx, joined);
  }

  async function moneyLine(kobo: bigint, lockedRate: bigint): Promise<string> {
    if (!deps.officialRate) return formatMoneyPair(kobo, lockedRate);
    const rate = await deps.officialRate();
    if (!rate) return `${formatNgnFromKobo(kobo)}\nThe Central Bank rate is unavailable.`;
    return `${formatMoneyPair(kobo, rate.koboPerUsdc)}\n1 USDC is ${formatOfficialRate(rate)} at the Central Bank rate for ${rate.asOf}.`;
  }

  async function joinConversation(conversation: { waitFor: (filter: "message:text") => Promise<{ message?: { text?: string } }> }, ctx: Context) {
    await ctx.reply(copy.startJoin);
    const next = await conversation.waitFor("message:text");
    await joinWithCode(ctx, next.message?.text?.trim() ?? "");
  }
  bot.use(createConversation(joinConversation as Parameters<typeof createConversation>[0], "join"));

  const sides = new Set<ContractSide>(["client", "contractor"]);

  async function startConversation(
    conversation: {
      external: <T>(fn: () => Promise<T>) => Promise<T>;
      waitFor: (filter: "message:text") => Promise<{ message?: { text?: string } }>;
    },
    ctx: Context,
  ) {
    await ctx.reply("Are you the Client or the Contractor?");
    const roleMsg = await conversation.waitFor("message:text");
    const role = (roleMsg.message?.text?.trim().toLowerCase() ?? "") as ContractSide;
    if (!sides.has(role)) {
      await ctx.reply("Reply contractor or client.");
      return;
    }
    await ctx.reply("What is the project called?");
    const named = await conversation.waitFor("message:text");
    const projectName = named.message?.text?.trim() ?? "";
    const from = ctx.from;
    if (!from || !projectName || projectName.startsWith("/")) {
      await ctx.reply("Send the project name.");
      return;
    }
    const started = await conversation.external(() =>
      startOwnProject(deps.db, {
        telegramId: BigInt(from.id),
        name: from.first_name || "Telegram",
        projectName,
        role,
      }),
    );
    const link = joinDeepLink(process.env.TELEGRAM_BOT_USERNAME || "CertaApp_bot", started.inviteCode);
    const other = sideLabel(started.inviteRole);
    await ctx.reply(`You are the ${sideLabel(role)} on ${projectName}. Share this link with the ${other}: ${link}`);
  }
  bot.use(createConversation(startConversation as Parameters<typeof createConversation>[0], "startProject"));

  async function contractConversation(
    conversation: {
      external: <T>(fn: () => Promise<T>) => Promise<T>;
      waitFor: (filter: "message:text") => Promise<{ message?: { text?: string } }>;
    },
    ctx: Context,
  ) {
    const document = ctx.message?.document;
    const filename = document ? filenameOf(document) : null;
    if (!document || !filename) {
      await ctx.reply("Send the contract as a PDF, Word, Excel, CSV, or text file.");
      return;
    }
    if ((document.file_size ?? 0) > MAX_CONTRACT_BYTES) {
      await ctx.reply("That file is too large. Send a file under 8 MB.");
      return;
    }
    const loaded = await conversation.external(async () => {
      const bytes = deps.loadDocument ? await deps.loadDocument(document.file_id) : await telegramFile(document.file_id);
      if (bytes.byteLength > MAX_CONTRACT_BYTES) throw new Error("too large");
      const parsed = deps.studyContract ? await deps.studyContract(filename, bytes) : await studyUpload(filename, bytes, agentRouterContract() ?? undefined);
      const rate = deps.officialRate ? await deps.officialRate() : null;
      return {
        filename,
        base64: Buffer.from(bytes).toString("base64"),
        sha256: sha256Hex(bytes),
        summary: parsed.summary,
        flags: parsed.flags,
        koboPerUsdc: rate ? rate.koboPerUsdc.toString() : "",
        asOf: rate?.asOf ?? "",
      };
    }).catch((error: unknown) => {
      const message = error instanceof Error && error.message === "too large" ? "That file is too large. Send a file under 8 MB." : readFailure(error);
      return { error: message };
    });
    if ("error" in loaded) {
      await ctx.reply(loaded.error);
      return;
    }
    if (!loaded.koboPerUsdc) {
      await ctx.reply("The Central Bank rate is unavailable, so this contract was not saved.");
      return;
    }
    if (loaded.summary.stages.length > MAX_CONTRACT_STAGES) {
      await ctx.reply(`This file has ${loaded.summary.stages.length} stages. A project can hold ${MAX_CONTRACT_STAGES}.`);
      return;
    }
    const rate = { koboPerUsdc: BigInt(loaded.koboPerUsdc), asOf: loaded.asOf };
    if (loaded.flags.length > 0) {
      await ctx.reply(`${contractNote(loaded.summary, rate.koboPerUsdc)}\n${loaded.flags.join("\n")}\nSend the file again once those figures add up.`);
      return;
    }
    await ctx.reply(contractNote(loaded.summary, rate.koboPerUsdc));
    let summary = loaded.summary;
    let site = "";
    for (const question of contractGaps(summary)) {
      let settled = false;
      while (!settled) {
        await ctx.reply(question.prompt);
        const next = await conversation.waitFor("message:text");
        const text = next.message?.text?.trim() ?? "";
        if (text === "/cancel") {
          await ctx.reply("The contract was not saved.");
          return;
        }
        const applied = applyGapAnswer(summary, question.id, text);
        if (!applied.ok) {
          await ctx.reply(applied.reason);
          continue;
        }
        summary = applied.summary;
        if (applied.site) site = applied.site;
        settled = true;
      }
    }
    if (!site) {
      await ctx.reply("The site address is missing, so this contract was not saved.");
      return;
    }
    await ctx.reply("Reply accept if this schedule is right. The contractor accepts later with /accept.");
    let accepted = false;
    while (!accepted) {
      const next = await conversation.waitFor("message:text");
      const text = next.message?.text?.trim().toLowerCase() ?? "";
      if (text === "/cancel") {
        await ctx.reply("The contract was not saved.");
        return;
      }
      if (text === "accept") {
        accepted = true;
        break;
      }
      await ctx.reply("Reply accept, or /cancel.");
    }
    const saved = await conversation.external(async () => {
      const row = await recordUploadedContract(deps.db, {
        telegramId: BigInt(ctx.from?.id ?? 0),
        senderName: ctx.from?.first_name ?? "Client",
        site,
        filename: loaded.filename,
        sha256: loaded.sha256,
        bytesBase64: loaded.base64,
        summary,
        koboPerUsdc: rate.koboPerUsdc,
        fxAsOf: rate.asOf,
        clientAccepted: true,
      });
      try {
        await ensureWallet(deps.db, row.partyId, () => createPartyWallet(row.partyId));
      } catch {
        return { ...row, wallet: false };
      }
      return { ...row, wallet: true };
    });
    const walletNote = saved.wallet ? "" : "\nThe payment account could not be created.";
    await ctx.reply(`${savedContractMessage(saved.stageCount, saved.contractorCode)}${walletNote}`);
  }
  bot.use(createConversation(contractConversation as Parameters<typeof createConversation>[0], "contract"));

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
      await ctx.reply(saved.ok ? gotFile(name, saved.pagesOrSheets) : saved.message);
      return;
    }
    if (!document || !filenameOf(document)) {
      await say(ctx, "Send the contract as a PDF, Word, Excel, CSV, or text file.");
      return;
    }
    if ((document.file_size ?? 0) > MAX_CONTRACT_BYTES) {
      await say(ctx, "That file is too large. Send a file under 8 MB.");
      return;
    }
    await ctx.conversation.enter("contract");
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
    await ctx.reply(saved.ok ? gotFile("photo.jpg", saved.pagesOrSheets) : saved.message);
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
    await ctx.conversation.enter("startProject");
  });

  bot.callbackQuery("go-join", async (ctx) => {
    if (!(await gate(ctx, false))) return;
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("joinConversation");
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
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project || !row.user) {
      await say(ctx, copy.noProjects);
      return;
    }
    const partyRows = await deps.db.select().from(parties).where(eq(parties.userId, row.user.id));
    const party = partyRows.find((item) => item.projectId === row.project?.id);
    const side = party?.role === "main_contractor" ? "contractor" : party?.role === "client" ? "client" : null;
    if (!side) {
      await say(ctx, "You are not the client or the contractor on this project.");
      return;
    }
    const result = await acceptContractSide(deps.db, { projectId: row.project.id, side });
    if (!result.ok) {
      await say(ctx, result.reason);
      return;
    }
    await say(ctx, result.both ? "Both sides have accepted this schedule. Money can be locked from it." : "You accepted. The other side still has to accept.");
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
      `${row.project.name}\n${await moneyLine(row.project.contractSumKobo, row.project.fxRateLocked)}\n${done} of ${stageRows.length} stages paid.`,
    );
  });

  bot.command("stages", async (ctx) => {
    if (!(await gate(ctx, true))) return;
    const row = ctx.from ? await active(deps.db, BigInt(ctx.from.id)) : null;
    if (!row?.project) {
      await say(ctx, copy.noProjects, "Stages");
      return;
    }
    await syncEscrowProject(deps.db, row.project).catch(() => undefined);
    const stageRows = await deps.db.select().from(stages).where(eq(stages.projectId, row.project.id));
    const lines = stageRows
      .sort((a, b) => a.stageIndex - b.stageIndex)
      .map((stage) => `${stage.stageIndex + 1}. ${stage.name} — ${stage.status}`);
    await say(ctx, lines.join("\n"), "Stages");
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
    const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await say(ctx, `Take the photo in the camera page.\n${url}/capture`, "Submit");
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

  bot.command(["menu", "projects", "upload", "photos", "review", "fund", "cancel"], async (ctx) => {
    if (!(await gate(ctx, false))) return;
    const who = person(ctx);
    if (!who) return;
    const command = ctx.message?.text?.split(/\s|@/)[0]?.replace(/^\//, "") ?? "menu";
    await runEngine(ctx, { type: "command", command, arg: typeof ctx.match === "string" ? ctx.match.trim() : "", from: who });
  });

  bot.on("message:text", async (ctx, next) => {
    const who = person(ctx);
    const text = ctx.message?.text ?? "";
    if (!who || text.startsWith("/")) return next();
    if (Object.keys(ctx.conversation.active()).length > 0) return next();
    const outbound = await handleIncoming(deps.db, { type: "text", text, from: who }, { paidWeather: deps.paidWeather });
    if (outbound.messages.length === 0 && !outbound.edit) return next();
    await speak(ctx, outbound);
  });

  bot.on("message:location", async (ctx, next) => {
    if (Object.keys(ctx.conversation.active()).length > 0) return next();
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
    if (slow) await ctx.answerCallbackQuery({ text: bGe5() });
    else await ctx.answerCallbackQuery();
    try {
      const outbound = await handleIncoming(deps.db, { type: "callback", data: ctx.callbackQuery.data, from: who }, {
        paidWeather: deps.paidWeather,
        release: async (input) => {
          const { releaseStageTx } = await import("../../../src/server/chain/flows.js");
          const tx = await releaseStageTx(deps.db, input);
          const hash = tx.txHash ?? "";
          return { ok: true as const, explorerLink: hash ? `https://sepolia.etherscan.io/tx/${hash}` : "pending" };
        },
      });
      await speak(ctx, outbound);
    } catch (error) {
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
