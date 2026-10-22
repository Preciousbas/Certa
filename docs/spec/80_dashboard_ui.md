# Prompt 80 — Web dashboard & Mini App UI: every page (paste into a NEW Cursor chat)

## Context
Read `docs/spec/01_PRODUCT_SPEC.md` completely (§3 tooltips, §5 screens, §6 copy rules, §7 tokens, §8 layout). Prompts 10–70 are done, so real data exists for every screen.
UX review findings (three rounds of screenshots, 20 Oct): no landing page; desktop Timeline is a single card in a huge empty canvas; content widths differ per page; small grey text is faint; orange used for non-primary things; mobile bottom nav uneven with "Timeline" clipped at the left edge and "More" offset lower; Stages not in the mobile main tabs; More menu stays open after navigation; loading flash; "Propose change" reloads the Changes page with no form; Export PDF previously dead (now opens a certificate page — keep it); Fund currency toggle now works (keep it); Wallet page labelled the server account as "Your payment account"; seeded dispute "Released in full" and ₦900,000 soakaway change (removed in prompt 10).

## Goal
A coherent, accessible, production UI where every page shows real data with its source, every button works or is hidden, and the layout is identical in width and rhythm across pages on desktop and mobile.

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
- Do **not** introduce a second design language: use the tokens in 01 §7 (CSS variables + Tailwind theme mapping if Tailwind is used).
- Do **not** compute money in components. Components receive formatted strings or bigint-as-string from server loaders using `src/lib/money`.
- Do **not** show a button that does nothing. Hide it, or disable it with a visible reason.
- Do **not** use orange (`--c-primary`) for anything except the one primary action on a view.

## Step 1 — Inspect and report
List the component library (Tailwind? shadcn/ui? CSS modules?), existing layout components, and each page's current width/padding. Screenshot every page at 1440×900 and 390×844 into `docs/evidence/80/before/` (Playwright script). Then implement.

## Step 2 — Design system
- `src/styles/tokens.css` with exactly the variables in 01 §7; map to Tailwind theme (`colors.primary` = `var(--c-primary)` etc.) if Tailwind exists.
- Components in `src/components/ui/` (build or adapt; each has a story/test page at `/dev/ui` available only when `NODE_ENV!=='production'`): `PageContainer` (max-width var(--content-max), page-pad), `PageHeader` (title, subtitle, actions slot), `Button` (primary | secondary | ghost | danger; loading state with spinner + "Working…" aria-live; disabled reason tooltip), `SegmentedToggle` (selected = ink-700 fill), `Money` (renders naira or USDC per the page's currency context, tabular nums, full-precision tooltip), `StatusChip` (one mapping from stage state → label + colour: not_started "Not started" neutral; in_progress "In progress" info; submitted/ai_review "Checking photos" warning; ai_fail "Needs work" danger; needs_more_evidence "More photos needed" warning; awaiting_certification "Waiting for consultant" warning; awaiting_client_approval "Waiting for client approval" warning; approved/releasing "Paying" info; released "Released" success; release_failed "Payment retrying" danger; disputed "Disputed" danger; cancelled "Cancelled" neutral), `InfoTip` (ⓘ with 01 §3 text, keyboard focusable, `aria-describedby`), `Skeleton`, `EmptyState` (icon, title, body, action), `ErrorState` (message + Try again + error id), `ConfirmDialog` (focus trap, Escape closes), `Toast` (aria-live polite), `ExplorerLink` (network-aware, "Proof ↗"), `SourceChip` (p.4 / Sheet!Row → opens document panel), `Timeline` + `TimelineEvent`, `StatTile`, `DataTable` (sortable, responsive → cards under 640 px), `BottomNav`, `MoreSheet`, `Sidebar`, `ProjectSwitcher`, `CurrencySwitch` (global: Naira | USDC; persisted per user; the **one** FX line "₦1,331.11 per USDC · {source}, set {date}" appears in the page footer of money pages).
- Icons: `lucide-react` (Timeline=Clock, Stages=Layers, Fund=Lock, Changes=GitPullRequestArrow, More=Menu, Reports=FileText, Documents=FolderOpen, People=Users, Wallet=Wallet, Billing=CreditCard, Settings=Settings).
- Loading: route-level `loading.tsx` with skeletons matching the final layout; show skeleton only after 200 ms (avoid flash); use React Suspense streaming for slow sections.

## Step 3 — Pages (data source → layout → copy). Route names per 01 §5; if existing routes differ (e.g. `/stages` instead of `/app/p/[id]/stages`), keep old paths as redirects.
**S0 Landing `/`** — data: static + `ESCROW_FACTORY_ADDRESS`, network config. Layout: header, hero (H1 40/48, sub 18/28, primary "Open in Telegram", secondary "Sign in"), "How it works" 3 cards, "Who it's for" 3 columns, trust section, optional 2-min demo video embed (from prompt 99), footer. Copy: 01 §5 S0 verbatim. Logged-in users see "Go to your projects" instead of Sign in.
**S2 Projects `/app`** — data: memberships → projects with status, next action. Cards: name, location, your role, status chip, "Next: {next_action}". Empty: "You're not on any project yet. Create one in Telegram, or ask for a join code." [Open in Telegram].
**S3 Overview** — header card (project name, location, contract sum, Released / Locked / In review progress bar from reconciled data), "Waiting for you" list (role-specific actions with buttons), latest 5 timeline events, stage mini-ledger. If no accepted contract: EmptyState "Start by uploading the contract or BoQ" [Upload documents] (client only).
**S4/S5/S6/S7** — from prompt 30 (verify the UI matches 01 §5 exactly; fix gaps).
**S8 Fund** — keep the working flow; re-skin; every amount follows the CurrencySwitch **and** the page's own "Show in" toggle stays in sync with it (one state, not two); Full vs Part-payment recomputes from accepted stage amounts minus already funded; copy per 01 §5 S8; confirmation dialog; pending/success/error states; "Lock" button is the page's only orange element.
**S9 Stages** — 4 StatTiles (Locked, In review, Released, Retention held) each with InfoTip, from reconciled chain data; DataTable rows → S10. Mobile: cards.
**S10 Stage detail** — per 01 §5 S10; **Export payment certificate (PDF)** generates a real PDF server-side (`@react-pdf/renderer` or `pdf-lib`): client letterhead if uploaded (Settings), certificate no., project, parties, stage, gross amount, retention, net paid, cumulative paid, FX line, release tx hash + QR code to the explorer link, consultant certification name/time, client approval name/time; stored in `certificates` bucket; download via signed URL. Only enabled when the stage is `released` (else hidden).
**S11 Timeline** — full-width within PageContainer; vertical timeline grouped by day (WAT), filters (All, Photos, AI checks, Approvals, Payments, Changes, Fees). Event types and renderers: `document_uploaded`, `extraction_ready`, `contract_accepted`, `escrow_created`, `funded`, `photos_submitted` (thumbnails strip), `ai_verdict` (chip, confidence bar, criteria ticks, reasons), `stage_submitted_onchain`, `certified`/`rejected` (who, reason), `approved`/`declined`, `released` (amount, Proof ↗), `x402_payment`, `variation_*`, `dispute_*`. Data: `audit_log` + joins, paginated (cursor, 30/page). Desktop uses a two-column layout ≥ 1280 px: timeline (2/3) + sticky "Project at a glance" (1/3) — fixes the empty canvas. Empty: "Nothing has happened on this project yet."
**S12 Changes** — tabs Variations | Disputes; **Propose change** opens a real form (Dialog on desktop, full-screen sheet on mobile): Title (required, 5–80), What's changing (required, 20–1000), Type (Add work / Remove work / Change work), Amount in naira (required; negative for removal shown as "reduces the contract by"), Affects stage (select or "New stage"), Attach photos/documents (optional, ≤5). Submit → server → B-VA-2 to the other party → toast "Sent to {name} for agreement. They have 72 hours to reply." Cards show status, who/when, response deadline countdown, Accept/Decline (only for the responding party; Decline needs a reason). Disputes: status, decide-after date, evidence, decision.
**S13 Reports** — Daily/Weekly toggle; generated from verdicts, stage states, txs, weather checks (no hand-written text): "This week: {n} photo sets checked ({pass} passed, {fail} need work, {unsure} need more photos); {₦released} released; next stage due: {stage}." + list of certificates (PDF links). Export report PDF.
**S14 People** — members table (name, role, joined, notifications status), Invite (role select → join link + copy button), Remove (confirm; not the last client).
**S15 Settings** — site location (map pin + radius slider 25–2000 m), spending cap (USDC + naira equivalent; changes need contractor acceptance only if contract requires — otherwise client only; logged), dispute decision days, reply window, letterhead upload (PDF/PNG, preview), **Pause project** (confirm: "Pausing stops billing and blocks new payments and photo checks. Locked money stays in the escrow. You can resume any time." → sets status `paused`; all money actions return "This project is paused." until Resume).
**S16 Wallet** — contractor/sub view: "Your payment account" (shows the **user's own** wallet, never the server/operator), payments received list with Proof ↗, retention held, Cash out card ("Cash out to bank — coming soon…" per J12), technical details (address, network "Ethereum Sepolia", "View on Etherscan (Sepolia)").
**S17 Billing** — plan (per active project, monthly ₦150,000 / yearly ₦1,500,000 — **confirm these with Precious; read from config, not hard-coded in components**), status, Pause/Resume, release fees this month (0.5% each, list), allowance usage (prompt 70 table).
**S18 Admin** — prompt 90.
**404/500** — branded: "We couldn't find that page." / "Something went wrong on our side. Nothing was paid or changed." + [Go to your projects] [Home]; 500 shows error id.
**Footer (all app pages)** — "Network: Ethereum Sepolia (test network) · Escrow factory 0x4F4c…0423 ↗ · Support: {SUPPORT_EMAIL} · Terms · Privacy".
**Mini App pages M1–M4** — same components; use Telegram `MainButton` for the primary action, `BackButton` for navigation, `HapticFeedback` on success/error; read `themeParams.bg_color` for background only.

## Step 4 — Mobile & accessibility rules
- Bottom nav per 01 §8 (Timeline, Stages, Fund, Changes, More), 5 equal flex items, icon above label, centred, `env(safe-area-inset-bottom)`; active = ink-700 text + 2 px top indicator; labels never clip (test at 320 px width).
- More sheet closes on route change (listen to pathname), outside tap and Escape; focus returns to the More button.
- WCAG 2.2 AA: contrast per tokens; all interactive elements keyboard reachable with visible focus; landmarks (header/nav/main/footer); `aria-current="page"` on nav; images have alt (photos: "Site photo {k} for stage {n}, taken {time}"); charts/progress have text equivalents; forms have labels and error text linked via `aria-describedby`; motion respects `prefers-reduced-motion`.
- Responsive tables become cards under 640 px; no horizontal scroll at 320 px.

## Acceptance criteria
- [ ] Every page uses `PageContainer`; a Playwright test measures main content width on every page at 1440 px and asserts all equal (≤ 1120 px).
- [ ] axe-core (`@axe-core/playwright`) shows zero serious/critical violations on every page (desktop + mobile).
- [ ] Bottom nav: 5 items with equal widths (±1 px) and labels baseline-aligned at 320, 390 and 430 px widths (Playwright bounding-box assertions).
- [ ] More sheet closes after navigation (Playwright).
- [ ] Currency switch changes every amount on S8, S9, S10 and the totals (test reads text before/after).
- [ ] Propose change form creates a variation and notifies the other party (integration test with mocked Telegram).
- [ ] Export payment certificate produces a PDF containing the tx hash and a QR code (test parses the PDF text).
- [ ] Pause project blocks fund/submit/release with the exact message; Resume restores.
- [ ] Landing page renders for logged-out visitors with Open in Telegram link `https://t.me/CertaApp_bot`.
- [ ] No orange element except one primary action per page (Playwright counts elements with computed background = primary colour ≤ 1 per view).
- [ ] After screenshots in `docs/evidence/80/after/` for every page at both sizes.

## Definition of Done — run these commands and paste output
```bash
pnpm typecheck && pnpm lint
pnpm test -- --reporter=verbose src/components
pnpm exec playwright test tests/e2e/ui-*.spec.ts tests/e2e/a11y.spec.ts
pnpm tsx scripts/screenshots.ts --out docs/evidence/80/after && ls docs/evidence/80/after
pnpm build
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
