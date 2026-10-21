# Prompt 60 — Telegram bot @CertaApp_bot: every command, button and message (paste into a NEW Cursor chat)

## Context
Read `docs/spec/01_PRODUCT_SPEC.md` (§4 journeys), `docs/spec/CODEBASE_MAP.md` (bot library, existing handlers), and message IDs already defined in prompts 30 (B-UP, B-EX, B-AC) and 50 (C-*). Prompts 10–50 are done. Most bot flows were never tested live (audit). Webhook hardening was done in prompt 20.

## Goal
A complete, role-aware bot where every flow in 01 §4 works by tapping buttons, every message is exactly the copy below, multi-project users can switch projects, and handlers are tested with a mocked Telegram API.

## Do-not-do list (applies to everything in this prompt)
- Do **not** guess the codebase. Inspect first; if something this prompt assumes does not exist or is different, write it in your report and adapt. Never silently invent a file, table, env var or function name that you have not checked.
- Do **not** put seeded, sample or hard-coded business data (projects, amounts, stages, disputes, changes, confidence scores, daily notes) in any production code path. Demo data exists only in `scripts/seed-demo.ts`, writes only to a workspace with `is_demo = true`, and the UI labels it "Demo workspace".
- Do **not** use `number`/floats for money. Kobo and micro-USDC are `bigint` (see docs/spec/02_DATA_AND_STATE.md §1).
- Do **not** commit secrets or print them in logs, errors, tests or your replies. All keys live in env vars, validated at boot, documented in `.env.example` with placeholder values.
- Do **not** remove or break working features: the funding flow (/fund → /api/mini/fund → Etherscan link), Export payment certificate, the Fund currency toggle, the 401 "Sign in from Telegram." protection on /api/mini/*, `/api/health`, the verified EscrowFactory and escrow contracts.
- Do **not** weaken, skip or delete a test to make it pass. Do not add `// @ts-ignore`, `eslint-disable` or `any` without a one-line justification comment.
- Do **not** move money, call a mainnet, or send Telegram messages to real users from tests. Tests use mocks or Sepolia test wallets created for tests.
- Do **not** start work belonging to a later prompt. If you notice it is needed, add it to `docs/spec/BACKLOG.md`.
- Do **not** claim something works without showing the command output that proves it.
- Do **not** write free-form copy; use the message catalogue (`src/bot/messages.ts`, one function per ID, typed params). Any new message needs an ID and goes in the catalogue.
- Do **not** expose wallet addresses, hashes or the word "blockchain" in contractor/sub messages except behind "Technical details".
- Do **not** perform money actions from a callback without re-checking role, state and idempotency server-side (callbacks can be replayed or tapped twice).

## Step 1 — Inspect and report
List existing commands/handlers, conversation/session storage, keyboard builders, Mini App button setup (`web_app` URLs), BotFather settings you can read via `getMyCommands`/`getChatMenuButton` (script). Keep working handlers; refactor into the structure below.

## Step 2 — Structure
```
src/bot/
  index.ts            # bot instance, middleware: requestId, user upsert, i18n(en), error handler
  messages.ts         # catalogue (IDs below)
  keyboards.ts        # inline keyboards; callback data format "v1:<action>:<id>[:<arg>]" ≤ 64 bytes
  flows/              # start.ts join.ts project.ts upload.ts invite.ts accept.ts fund.ts submit.ts review.ts approve.ts dispute.ts variation.ts weather.ts wallet.ts help.ts
  state.ts            # conversation state in DB (table bot_sessions: telegram_user_id, project_id, step, data jsonb, expires_at)
```
Callback handling: answerCallbackQuery within 1 s ("Working on it…" for slow actions), then edit the original message to show the outcome and remove used buttons (prevents double taps). Unknown/expired callback → "This button has expired. Tap /menu to start again."
Formatting: HTML parse mode, escape user content. Money in naira first; USDC only in technical details or for clients when they enable "Show USDC".

## Step 3 — Commands (set with `setMyCommands`, per scope)
| Command | Who | Does |
|---|---|---|
| /start | all | Welcome or deep-link join (`/start join_<CODE>`) |
| /menu | all | Main menu for the current project and role |
| /projects | all | Switch project |
| /upload | client, consultant | Start document upload |
| /photos | contractor, sub | Submit stage photos |
| /review | consultant, client | Items waiting for you |
| /fund | client | Open Fund Mini App |
| /wallet | contractor, sub | Payment account & payments received |
| /help | all | Help |
| /done | uploader | Finish an upload batch |
| /cancel | all | Cancel current step |
Menu button: Mini App `web_app` → `${APP_URL}/mini` (opens role-aware home).

## Step 4 — Message catalogue (verbatim; {placeholders} are typed params)
**Start & menu**
- B-ST-1 (new user): "Welcome to Certa 👷🏾\nCerta holds building money safely and pays each stage only when the work is done and checked.\n\nWhat would you like to do?" Buttons: [Create a project] [I have a join code] [How Certa works]
- B-ST-2 (how it works): "1. The client uploads the contract or BoQ. Certa reads the figures and both sides agree the payment stages.\n2. The client locks the money in an escrow.\n3. The contractor sends site photos from Certa. Certa's AI checks the work, the consultant certifies, and the client approves payment.\nEvery step is recorded." Buttons: [Create a project] [Back]
- B-ST-3 (returning user): "Welcome back, {first_name}. Current project: **{project}** ({role_label})." + role menu.
- B-ST-4 (ask code): "Send me your 8-letter join code (for example K7MX2QPA)."
- B-ST-5 (bad code): "That code isn't valid or has expired. Ask the person who invited you for a new one."
- Role menus (buttons): client → [Upload contract or BoQ] [Review figures] [Fund] [Waiting for me ({n})] [Invite people] [Project report] [Switch project]; contractor → [Submit stage photos] [My stages] [Payments] [Propose change] [Switch project]; subcontractor → [Submit stage photos] [My stages] [Payments]; consultant → [Waiting for me ({n})] [Project report] [Disputes] [Switch project].

**Project creation**
- B-PR-1: "What's the project called? (for example \"4-bedroom duplex, Plot 14 Lekki\")"
- B-PR-2: "Where is the site? Type the address."
- B-PR-3: "Now share the site's location so Certa can check photos are taken there. Tap 📎 → Location → Send my current location (or pick the site on the map)." Buttons: [Skip for now]
- B-PR-4: "When does work start? (for example 3 Nov 2026)" — parse dd Mon yyyy / dd/mm/yyyy; invalid → "I didn't understand that date. Try like this: 3 Nov 2026."
- B-PR-5: "✅ Project created: **{project}**.\nNext: upload the signed contract and the priced BoQ." Buttons: [Upload contract or BoQ] [Invite people]

**Invite & join**
- B-IN-1: "Who are you inviting?" Buttons: [Contractor] [Subcontractor] [Consultant]
- B-IN-2: "Share this link with your {role_label}. It works once and expires on {date}.\n{link}" Buttons: [Share] (switch_inline_query) [Done]
- B-IN-3 (to invitee): "{inviter} invited you to join **{project}** as {role_label}. Join?" Buttons: [Join] [Not now]
- B-IN-4 (joined, contractor/sub): "You're in. Payments for your work on {project} will go to your Certa payment account. You don't need to set anything up." Buttons: [My stages] [How payments work]
- B-IN-5 (joined, consultant): "You're in as consultant on {project}. You'll be asked to certify each stage and to decide disputes if the parties can't agree."
- B-IN-6 (to inviter): "{name} joined {project} as {role_label}."

**Upload / extraction / acceptance** — B-UP-1…7, B-EX-1…4, B-AC-1…4 exactly as in prompt 30 §8. Buttons: B-UP-1 [Done]; B-EX-1/2 [Review figures] (web_app → /mini/contract?v=…); B-EX-3 [Enter stages manually] [Upload more]; B-AC-1 [Review plan] [Accept] [Ask for a change]; B-AC-2 [Edit plan].

**Funding**
- B-FU-1: "Lock money for {project}. Choose how much to lock now." Buttons: [Open Fund] (web_app /mini/fund)
- B-FU-2 (after tx confirmed): "🔒 Locked {₦amount} for stages {from}–{to}. It can only be paid out for approved stages.\nProof of payment: {explorer_link}"
- B-FU-3 (to contractor): "Good news: {client} has locked {₦amount} for stages {from}–{to}. You can start stage {from}."
- B-FU-4 (failure): "The money wasn't locked: {plain_reason}. Nothing was taken from your account. Try again, or contact support at {support_email}."

**Photos & verdict** (C-1…C-9 are Mini App screens)
- B-PH-1: "Which stage are you sending photos for?" Buttons: one per eligible stage "{n}. {name}" + [Cancel]
- B-PH-2: "Open the camera to take 3–8 photos of **{stage}**. Show:\n{criteria_bullets}" Buttons: [Open camera] (web_app /mini/capture?stage=…)
- B-VF-1 (consultant): "📋 Stage {n} — {stage} on {project} passed Certa's check ({confidence}% sure).\n{reasons_bullets}\nPlease certify or reject." Buttons: [View photos] [Certify] [Reject]
- B-VF-2 (client FYI): "Stage {n} — {stage} passed Certa's photo check. Waiting for {consultant} to certify. You'll be asked to approve payment of {₦amount} next."
- B-VF-3 (contractor): "✅ Your photos for stage {n} passed the check. The consultant will now certify it."
- B-VF-4 (fail): "❌ Stage {n} isn't ready for payment yet. The money stays locked.\nWhat's missing:\n{issues_bullets}\nWhen it's done, send new photos." Buttons: [Send new photos]
- B-VF-5 (unsure): "I couldn't confirm stage {n} from these photos. Please send more photos showing:\n{missing_shots_bullets}" Buttons: [Send more photos]
- B-VF-6 (consultant, unsure): "Stage {n} — {stage}: Certa isn't sure ({confidence}%). The contractor has been asked for more photos. You can also review it yourself." Buttons: [Review now]
- B-VF-7 (safety): "⚠️ Safety concern seen in photos for stage {n} on {project}: {flags}. Please follow up on site."

**Certify / approve / release**
- B-RV-1 (consultant reject → reason prompt): "Why are you rejecting stage {n}? Your reason will be sent to the contractor (at least 10 characters)."
- B-RV-2 (to contractor on reject): "Stage {n} was not certified by {consultant}: \"{reason}\". The money stays locked. Fix it and send new photos."
- B-AP-1 (client, ≤ cap): "Stage {n} — {stage} is certified by {consultant}.\nPay {₦amount} to {contractor}? ({₦retention} retention is kept until the defects period ends.)" Buttons: [Approve payment] [Decline] [View evidence]
- B-AP-2 (client, > cap): "Stage {n} — {stage} is certified by {consultant}.\nThis payment of {₦amount} is above your spending cap of {₦cap}, so it needs your approval.\nPay {contractor}?" Buttons: [Approve payment] [Decline] [View evidence]
- B-AP-3 (confirm tap): "Paying {₦amount} for stage {n}… This usually takes under a minute."
- B-AP-4 (released, to all): "💸 Paid {₦amount} to {contractor} for stage {n} — {stage}.\nProof of payment: {explorer_link}"
- B-AP-5 (decline reason prompt): "Why are you declining payment for stage {n}? This goes to the contractor and the consultant (at least 10 characters)."
- B-AP-6 (release failed): "The payment for stage {n} didn't go through yet. The money is safe in the escrow. Certa is retrying and will message you."
- B-AP-7 (reminder to client after 48 h): "Stage {n} has been certified for 2 days and is waiting for your approval."

**Disputes & variations**
- B-DI-1: "Why are you disputing stage {n}? The money will stay locked until it's settled." → reason → optional photos → "Dispute opened. {other_party} and {consultant} have been told. If you can't agree by {decide_after_date}, {consultant} will decide."
- B-DI-2 (consultant decision): "The dispute on stage {n} is now yours to decide. Reason: \"{reason}\"." Buttons: [View evidence] [Pay the stage] [Don't pay] 
- B-VA-1: "Describe the change (for example \"Add a second soakaway\")." → "How much will it cost in naira?" → "Which stage does it affect?" (buttons + [New stage]) → summary + [Send for agreement]
- B-VA-2 (to other party): "{name} proposed a change on {project}: **{title}** — {₦amount}. Please accept or decline within 72 hours." Buttons: [View] [Accept] [Decline]
- B-VA-3: "Change agreed: {title} ({₦amount}). The payment plan has been updated."

**Weather (x402)** — B-WX-1…3 defined in prompt 70.

**Wallet / payments**
- B-WA-1: "Your payments on {project}:\n{lines: "Stage {n}: {₦amount} on {date}"}\nTotal received: {₦total}. Retention held: {₦retention}.\n\nCash out to bank: coming soon. We're adding naira bank withdrawals with a licensed partner." Buttons: [Technical details]

**Generic**
- B-GE-1 (no permission): "Only the {required_role} can do this on {project}."
- B-GE-2 (error): "Something went wrong on our side (ref {request_id}). Nothing was paid or changed. Please try again in a minute."
- B-GE-3 (/help): "Here's what I can do:\n/menu — your options for this project\n/projects — switch project\n/photos — send stage photos\n/review — things waiting for you\n/wallet — your payments\nNeed a person? Email {support_email}."

## Step 5 — Notifications service
All outbound messages go through `notify(userId, messageId, params, {dedupeKey})` → `notifications` row → job sends (respect Telegram 30 msg/s global and 1 msg/s per chat; retry 429 using `retry_after`). If a user blocked the bot (403), mark membership notification channel `blocked` and show it in the web People page.

## Acceptance criteria
- [ ] Every message ID above exists in `messages.ts` with the exact text (snapshot test).
- [ ] Handler tests (mocked Bot API, e.g. grammY's transformer or a fake `fetch`) for each flow per role: start, join (valid/invalid/expired/used), create project, upload batch, accept/ask change, fund, photos → each verdict path, certify/reject, approve ≤ cap and > cap, decline, dispute, variation, wallet.
- [ ] Double-tapping Approve results in one release (test).
- [ ] A contractor tapping a client-only callback gets B-GE-1 (test).
- [ ] `setMyCommands` per role scope and menu button configured via `scripts/set-bot-config.ts` (paste output).
- [ ] Manual test log `docs/evidence/60/telegram-run.md` with screenshots of each flow on a real phone.

## Definition of Done — run these commands and paste output
```bash
pnpm typecheck && pnpm lint
pnpm test -- --reporter=verbose src/bot
pnpm tsx scripts/set-webhook.ts --info
pnpm tsx scripts/set-bot-config.ts --dry-run
pnpm build
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
