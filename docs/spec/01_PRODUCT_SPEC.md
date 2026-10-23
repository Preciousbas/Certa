# 01 — Certa product spec (source of truth for behaviour, screens and copy)

Cursor: this file is a reference, not a task. Every numbered prompt points here. When a prompt and this file disagree, **this file wins** for copy and behaviour, and `02_DATA_AND_STATE.md` wins for data. If something here is impossible given the actual code, stop and report it; do not improvise.

## 1. What Certa is (one paragraph, use verbatim on the landing page)
> Certa holds construction money safely and pays each stage only when the work is done. The client uploads the contract or bill of quantities, Certa reads every figure from it, and both sides agree the payment stages. The money is locked in an escrow. When the contractor takes site photos in Telegram, Certa's AI site engineer checks the work against that stage's requirements, and the client or consultant releases the money with one tap. Every photo, decision and payment is recorded and can be checked on the blockchain.

Market: Nigerian building projects (residential duplexes, estates, commercial fit-outs). Currency of contracts: Nigerian naira (NGN). Settlement: USDC on Ethereum Sepolia today (testnet), chain configurable later.

## 2. Personas

| Persona | Who they are | Goal | Fear | Uses |
|---|---|---|---|---|
| **Client / developer** (e.g. "Mrs Adaeze Okafor, building a 4-bed duplex in Lekki") | Pays for the work. Owns the workspace and subscription. | Pay only for work actually done; see progress without visiting site daily. | Paying ahead and the contractor abandoning site; inflated valuations. | Telegram bot (approve, fund) + web dashboard (review contract, reports). |
| **Contractor** (e.g. "Emeka, Emmy Builders Ltd") | Main contractor on the contract. | Get paid fast for each completed stage. | Client delaying payment for no reason; disputes with no record. | Telegram bot + Mini App camera. No crypto knowledge. |
| **Subcontractor** (e.g. "Tunde, roofing sub") | Works under the contractor on certain stages. | Get paid for their stages. | Main contractor not passing money on. | Telegram only; sees only stages assigned to them. |
| **Consultant** (e.g. "Engr. Bisi Adeyemi, COREN-registered, the project engineer/QS") | Independent professional named in the contract. | Certify work fairly; decide disputes. | Being blamed; no evidence trail. | Telegram (review queue) + web (evidence, reports). |
| **Certa admin** (Certa staff) | Support and operations. | Fix stuck jobs without touching money by hand. | Breaking someone's escrow. | /admin only, behind login + allowlist. |

Rules: one person can hold different roles in different projects (Emeka is contractor on project A and client on project B). Roles are **per project membership**, never global, except `platform_admin`.

## 3. Glossary and tooltips (exact text; every tooltip is one line)
Show a small "ⓘ" button next to each term the first time it appears on a screen. Tap/hover shows this text exactly:

| Term | Tooltip |
|---|---|
| BoQ (bill of quantities) | The priced list of every item of work, with quantity, unit and rate. |
| Contract sum | The total agreed price for the whole job, including VAT if the contract says so. |
| Stage | A part of the job that is paid for when it is finished, for example "First floor slab". |
| Acceptance criteria | What must be visible in the photos before a stage can be paid. |
| Valuation | A measurement of how much work has been done, used to decide how much to pay. |
| Retention | A small part of each payment (usually 5%) kept back until the defects period ends. |
| Defects liability period | The time after completion when the contractor must fix faults for free. Retention is paid after it ends. |
| Mobilisation advance | Money paid at the start so the contractor can set up site. It is recovered from later payments. |
| Variation | A change to the work (added, removed or altered) agreed by both sides, with its own price. |
| Provisional sum | Money set aside for work that is not fully designed yet. It is only spent with approval. |
| Contingency | A reserve for unexpected work. It is only spent through an agreed variation. |
| Liquidated damages (LD) | A fixed amount the contractor pays per day or week of late completion, as set in the contract. |
| Locked | The money is in the escrow and cannot be moved until this stage is approved. |
| In review | Photos were sent for this stage and are waiting for the AI check or an approval. |
| Released | The money for this stage has been paid to the contractor. The payment link proves it. |
| Confidence | How sure the AI is about its verdict, from 0% to 100%. Below 75% a person must check. |
| Spending cap | The largest payment Certa can release without the client pressing Approve. |
| Escrow | A locked account on the blockchain that only pays out under the agreed rules. |
| USDC | A digital dollar. 1 USDC is worth about 1 US dollar. Certa uses it to hold the money. |
| Exchange rate | The naira price of 1 USDC that Certa uses on every screen. The date shows when it was set. |
| Weather check | Before a concrete pour, Certa buys a weather forecast so concrete is not poured into rain. |
| Gas | A small network fee for each blockchain payment. Certa pays it from your plan; you never buy it. |
| Workspace allowance | The amount your plan covers each month for network fees and checks Certa pays for. |
| Release fee | Certa's fee of 0.5% of each payment released. |
| Dispute | A formal disagreement about a stage. The money stays locked until it is settled. |
| Join code | A short code that lets someone join one project only. |

## 4. User journeys (step by step)
Notation: [Bot] = Telegram chat, [Mini] = Telegram Mini App, [Web] = dashboard in a browser (Telegram Login), → = system action.

### J1. Client creates a workspace and project
1. [Bot] Client taps Start on @CertaApp_bot → welcome message (60_telegram_bot.md §2).
2. Client taps **Create a project** → bot asks project name → location (text, then optional Telegram location pin for the site GPS) → start date.
3. → System creates `workspace` (if the client has none), `project` (status `draft`), membership role `client`.
4. Bot replies with the project card and buttons **Upload contract or BoQ**, **Invite people**.

### J2. Client uploads contract / BoQ, AI extracts, client reviews (core)
1. [Bot or Web] Client taps **Upload contract or BoQ** and sends 1–10 files (PDF, DOCX, XLSX/XLS/CSV, JPG/PNG/HEIC).
2. → Each file: size/type check, SHA-256, private storage, `documents` row (status `uploaded`). Bot: "Got it: <filename> (<n> pages). Reading it now — this takes about 1–3 minutes."
3. → Background job parses each file (30_contract_boq_intake.md §3), then extracts (§4), then validates in code (§5).
4. → Extraction ready: bot sends summary (§7 of 30) + **Review in Certa** Mini App button. Web shows the Review screen (S6 below).
5. Client checks figures (each linked to its page/cell), fixes issues, edits stages (merge/split/rename/re-amount) until **Totals reconcile** shows green.
6. Client taps **Send to contractor for agreement**. Allowed only when there are zero blocking issues.
7. → `contract_versions` row frozen (status `pending_acceptance`); contractor (if joined) gets the same summary.

### J3. Invite + join
1. Client taps **Invite people** → chooses role (Contractor / Subcontractor / Consultant) → system creates a single-use join code (8 chars, A–Z 2–9, no 0/O/1/I), valid 7 days → bot shows link `https://t.me/CertaApp_bot?start=join_<CODE>` and a **Share** button.
2. Invitee opens link → bot: "You've been invited to join **<project>** as **<role>** by **<client name>**. Join?" [Join] [Not now].
3. On Join → membership created. For contractor/subcontractor: → CDP wallet created automatically (no crypto words shown); bot says "You're in. Payments for your work will come to your Certa payment account."
4. Contractor then receives the pending contract summary (J4).

### J4. Both-party acceptance
1. Contractor sees summary + **Accept**, **Ask for a change**.
2. Ask for a change → contractor types the reason (min 10 chars) → client notified; version goes back to `draft`; any new version needs both accepts again.
3. Both accepted → version `accepted` (immutable, with document hashes and timestamps) → on-chain escrow can be created (J5). Bot to both: "Contract agreed by both sides on <date, time WAT>. Next: the client funds the escrow."
4. Reply window: if the contractor has not responded in 72 h → reminder at 24 h and 48 h; at 72 h → escalate to consultant ("<contractor> has not responded to the contract for 72 hours").

### J5. Escrow creation and funding
1. Client taps **Fund** → [Mini/Web] Fund screen (S8): choose **Full contract sum** or **Part-payment up to stage N**. Amounts per stage shown in naira and USDC at one dated rate.
2. On first fund → escrow created from the accepted version via EscrowFactory (stage amounts, retention bps, cap, defects period, roles = 4 distinct wallets).
3. Client confirms "Lock ₦X (Y USDC) in escrow" → tx service submits approve + fund → bot posts "Locked Y USDC for stages 1–N. Proof: <Etherscan link>".

### J6. Contractor submits stage photos → AI verdict
1. [Bot] Contractor taps **Submit stage photos** → picks stage → [Mini] camera opens (no gallery). 3–8 photos required; GPS on.
2. → Each photo: nonce check, capture time ≤ 10 min old, GPS within project radius (default 150 m), hash, store.
3. → Vision model returns strict JSON verdict (50_ai_photo_verification.md).
4. Pass (≥ 0.75, all criteria met) → `submitStage(evidenceHash)` on-chain → stage `awaiting_approval` → consultant and client notified.
5. Fail → stage `ai_fail`, money stays locked, contractor told exactly what's missing.
6. Unsure / < 0.75 → `needs_more_evidence`, contractor asked for specific photos, consultant notified.

### J7. Approval and release
1. Consultant reviews evidence + verdict → **Certify** or **Reject (reason)**.
2. If stage amount ≤ cap → after consultant certifies, client gets **Approve release** (still a human click by the client; cap only controls whether the on-chain client signature is needed). If amount > cap → client must Approve; the on-chain `clientApprove` (or signature) is required.
3. → Tx service releases; on confirmation bot posts "Paid ₦X (Y USDC) to <contractor> for Stage N: <name>. Proof: <link>". Retention portion stays in escrow.
4. Reject → reason required (min 10 chars), logged, contractor notified; stage back to `in_progress`.

### J8. Dispute
1. Client (or contractor) taps **Dispute** on a stage → reason + optional photos → stage `disputed`, on-chain `dispute` called, money stays locked.
2. Parties settle → client taps **Resolve: pay / don't pay** with counter-sign by contractor, or after N days (project setting, default 7) the consultant gets **Decide** buttons.

### J9. Variation
1. Either party taps **Propose change** → form: title, description, type (add/omit/alter), amount (₦), affects stage (optional), photos/docs.
2. Other party Accepts/Declines within 72 h (escalation as J4). Accepted → new stage (or amount change) → new contract version accepted by both → `addVariation` on-chain.

### J10. Retention release, close-out
At completion → defects period countdown visible. After it ends with no open defects → client taps **Release retention** → on-chain `releaseRetention`.

### J11. Pre-pour weather check (x402)
Before a stage tagged `concrete_pour` is started (contractor taps **Planning to pour**), the agent pays for a weather forecast via x402; if rain probability ≥ 60% in the next 24 h at the site → warning to contractor + consultant. Timeline shows "Agent paid 0.01 USDC for a weather check" with tx link.

### J12. Cash out (stub, clearly labelled)
Contractor wallet screen shows **Cash out to bank — coming soon** with one line: "We're adding naira bank withdrawals with a licensed partner." No fake quote.

## 5. Screen list (every screen)
Screen IDs are used by 80_dashboard_ui.md and tests. Every screen has: loading (skeleton matching final layout; no spinner flash under 300 ms), empty, error ("Something went wrong loading <thing>. Try again." + **Try again** button + error ID), and success states.

| ID | Route | Who | Purpose |
|---|---|---|---|
| S0 | `/` (logged out) | Public / judges | Landing |
| S1 | `/login` | Anyone | Telegram Login Widget |
| S2 | `/app` | Member | Project list + Switch project |
| S3 | `/app/p/[projectId]` | Member | Overview |
| S4 | `/app/p/[projectId]/documents` | Client, consultant | Upload + documents list |
| S5 | `/app/p/[projectId]/documents/[docId]` | Client, consultant | Parsed view with page/cell anchors |
| S6 | `/app/p/[projectId]/contract/review` | Client (edit), others (read) | Extraction review |
| S7 | `/app/p/[projectId]/contract` | Members | Accepted contract summary + versions |
| S8 | `/app/p/[projectId]/fund` | Client | Fund escrow |
| S9 | `/app/p/[projectId]/stages` | Members | Stage ledger |
| S10 | `/app/p/[projectId]/stages/[n]` | Members | Stage detail: evidence, verdicts, approvals, txs |
| S11 | `/app/p/[projectId]/timeline` | Members | Event log |
| S12 | `/app/p/[projectId]/changes` | Members | Variations + disputes |
| S13 | `/app/p/[projectId]/reports` | Client, consultant | Daily/weekly report + certificate PDFs |
| S14 | `/app/p/[projectId]/people` | Client | Members, invites |
| S15 | `/app/p/[projectId]/settings` | Client | Site radius, cap, dispute days, letterhead, pause |
| S16 | `/app/wallet` | Contractor, sub | Payment account |
| S17 | `/app/billing` | Client | Subscription + allowance |
| S18 | `/admin` | platform_admin | Support console |
| M1 | `/mini/capture` | Contractor, sub | Camera |
| M2 | `/mini/review` | Consultant, client | Review evidence & decide |
| M3 | `/mini/fund` | Client | Same as S8 |
| M4 | `/mini/contract` | Client, contractor | Review & accept |
| 404/500 | — | — | Branded error pages |

### Field-level detail for the key screens
**S0 Landing.** Header: logo "Certa." + **Open in Telegram** (primary, links `https://t.me/CertaApp_bot`) + **Sign in** (secondary). Hero H1: "Pay for building work only when it's done." Sub: the §1 paragraph's first two sentences. Three cards "How it works": 1 "Upload the contract" — "Certa reads the contract or BoQ and proposes payment stages. Both sides agree." 2 "Lock the money" — "The client locks the stage payments in an escrow nobody can touch alone." 3 "Photo, check, pay" — "The contractor sends site photos. Certa's AI checks the work and the client releases payment with one tap." "Who it's for" row: Clients, Contractors, Consultants (one line each). Trust section: "Escrow contract: 0x4F4c…0423 (Ethereum Sepolia) — View on Etherscan"; "Funds move only under the contract's rules: stage approval, spending cap, disputes lock money." Footer (all pages): network, factory address link, support@ email (env `SUPPORT_EMAIL`), Terms, Privacy, © year.

**S4 Documents.** Drop zone: "Drop your contract, BoQ or payment schedule here, or **choose files**. PDF, Word, Excel, CSV or photos. Up to 20 MB each, 10 files." List columns: File name, Type, Pages/Sheets, Uploaded by, Uploaded at (WAT), Status chip (Uploaded / Reading / Read / Couldn't read), Actions (View, Remove — remove only before acceptance, with confirm). Button **Extract figures** (primary; enabled when ≥1 file is Read). Empty: "No documents yet. Upload the signed contract and the priced BoQ — Certa will read every figure from them."

**S6 Review.** Top summary bar: Contract sum ₦, VAT ₦ (rate %), Retention % (₦), Mobilisation advance ₦, Defects period, LD rate, Start–Completion dates, FX "₦1,331.11 per USDC · CBN rate set 15 Oct 2026" (shown **once** here and once in the page footer of money pages). Reconciliation panel: green "Totals reconcile: stages add up to the contract sum exactly." or red "Stages add up to ₦X, but the contract sum is ₦Y — a difference of ₦Z." Issues list (blocking red, warnings amber) with **Go to** links. Parties card. BoQ accordion by bill with item rows (ref, description, unit, qty, rate, amount, ✓/⚠ recompute). Stage table: #, Name, Amount ₦, USDC, % of total, Acceptance criteria (editable list), Tags (concrete_pour, roofing…), Assigned to (contractor/sub), Actions (Rename, Split, Merge with next, Change amount, Delete). Every number shows a small source link "p.4" / "BoQ!F27" opening S5 at that anchor. Low-confidence (< 0.8) fields: amber outline + "Check this — AI is not sure (62%)". Buttons: **Save draft**, **Send to contractor for agreement** (primary, disabled with reason while blocking issues exist: "Fix 2 issues first").

**S8 Fund.** Toggle (segmented, selected = navy fill, not orange): "Full contract sum" / "Part-payment". Part-payment: select "Cover up to stage" N → table of stages 1..N with amount each, Total. Currency switch "Show in: Naira | USDC" changes **every amount on the page**. Total line: "Total to lock: ₦26,622.20 (20.000000 USDC)". Primary: "Lock ₦26,622.20 in escrow". Confirm dialog: "You're about to lock 20 USDC (₦26,622.20) for stages 1–5. Only approved stages can be paid from it. Continue?" [Lock money] [Cancel]. Pending: "Locking… waiting for the network (usually under 30 seconds)." Success: "Locked. Proof on Etherscan ↗". Error: "The payment didn't go through: <plain reason>. No money was moved."

**S9 Stages.** Tiles: Locked ₦ (funded, not released), In review ₦ (awaiting_approval + ai_review), Released ₦ (sum of confirmed releases), Retention held ₦. All from DB reconciled with chain (02 §6). Rows: number, name, amount, status chip, last event, assigned to.

**S10 Stage detail.** Criteria checklist with AI per-criterion result; photos grid (thumbnail, captured at WAT, distance from site "38 m from site", hash short); verdict card (Pass/Fail/Not sure, confidence %, reasons, issues, model + prompt version in small text); approvals list; transactions (type, amount, status, Etherscan link); buttons per role: Certify / Reject (consultant), Approve release / Dispute (client), Submit photos (contractor), **Export payment certificate (PDF)**.

## 6. UI copy rules
- Plain English, short sentences, second person. No "on-chain", "smart contract", "wallet address", "gas" on contractor screens; say "payment account", "proof of payment", "network fee (paid by Certa)". Advanced details sit behind **Show technical details**.
- Money format: `₦1,350,000.00` (always 2 dp for naira in tables; summary may drop .00 for whole amounts), `20.000000 USDC` in technical details, `20 USDC` elsewhere (trim trailing zeros, max 2 dp shown, full 6 dp in tooltip). Never show both currencies with different rates.
- Dates/times: `20 Oct 2026, 16:40 WAT` (projects are in Nigeria; show WAT = Africa/Lagos). Relative times only in Timeline ("2 h ago" with absolute in tooltip).
- Errors always say what happened, whether money moved, and what to do next.
- Buttons are verbs: "Lock money", "Approve release", "Send photos". Never "Submit" alone.

## 7. Design tokens (replace current ad-hoc styles)
Brand feeling: trustworthy, engineering, calm. Navy base (keeps today's identity), safety orange only for primary actions. **No brown.**

```css
:root{
  /* Neutrals */
  --c-ink-900:#0B1A2E;  /* sidebar, headings */
  --c-ink-800:#132A47;
  --c-ink-700:#1E3A5F;  /* selected toggle fill */
  --c-text:#0F172A;      /* body on light: 17.9:1 on #fff */
  --c-text-muted:#475569;/* secondary text: 7.6:1 on #fff — replaces faint grey */
  --c-text-subtle:#5B6B80;/* minimum for small text: 5.4:1 on white, 5.1:1 on bg */
  --c-border:#CBD5E1;
  --c-surface:#FFFFFF;
  --c-bg:#F5F7FA;
  /* Action */
  --c-primary:#C2410C;   /* safety orange 700, white text 5.2:1 AA */
  --c-primary-hover:#9A3412;
  --c-focus:#2563EB;     /* 3px focus ring */
  /* Status (text on tinted bg must stay ≥4.5:1) */
  --c-success:#047857; --c-success-bg:#ECFDF5;   /* Released, Pass */
  --c-warning:#B45309; --c-warning-bg:#FFFBEB;   /* In review, Not sure, low confidence */
  --c-danger:#B91C1C;  --c-danger-bg:#FEF2F2;    /* Fail, Disputed, errors */
  --c-info:#1D4ED8;    --c-info-bg:#EFF6FF;      /* Locked */
  --c-neutral-chip:#334155; --c-neutral-chip-bg:#F1F5F9; /* Not started */
  /* On dark sidebar */
  --c-on-dark:#F8FAFC; --c-on-dark-muted:#CBD5E1; /* 11.8:1 on ink-900 */
  /* Type (Inter, fallback system-ui) — size/line-height */
  --t-xs:12px/16px; --t-sm:14px/20px; --t-base:16px/24px; --t-lg:18px/28px;
  --t-xl:20px/28px; --t-2xl:24px/32px; --t-3xl:30px/36px; --t-4xl:40px/48px;
  /* Weight: 400 body, 500 labels, 600 headings, 700 hero numbers. Numbers use tabular-nums. */
  /* Spacing (4px base) */
  --s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-8:32px;--s-10:40px;--s-12:48px;--s-16:64px;
  --radius-sm:6px;--radius-md:10px;--radius-lg:14px;
  --shadow-card:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.1);
  /* Layout */
  --content-max:1120px;   /* ONE content width for every app page */
  --sidebar-w:240px;
  --page-pad-x:24px;      /* 16px under 640px */
}
```
Rules: smallest text is 12px and only for chips/captions in `--c-text-subtle` or darker; body ≥ 14px. Orange is **only** for the single primary action per view. Selected toggles/tabs: `--c-ink-700` fill + white text. Links: `--c-info`, underlined on hover. Focus ring visible on every interactive element. Touch targets ≥ 44×44 px. Contrast checked with axe in CI (90_quality_ops.md).

## 8. Layout
- Desktop (≥ 1024 px): fixed sidebar 240 px (ink-900) + main area; main content centred, `max-width: var(--content-max)`, padding 24 px. Every page uses the same `<PageContainer>`; no page sets its own width.
- Tablet (640–1023): sidebar collapses to icons (72 px).
- Mobile (< 640): no sidebar. Top bar (project switcher + currency toggle). **Bottom nav: 5 equal-width items**, each icon (24 px) above label (12 px/16 px, centred), height 64 px + safe-area inset: Timeline, Stages, Fund, Changes, More. Labels never truncate or misalign. More opens a sheet (Reports, Documents, People, Wallet, Billing, Settings) that **closes on navigation** and on outside tap/Escape.
- Inside Telegram Mini App: respect `themeParams` only for background; keep tokens for text contrast; use Telegram MainButton for the screen's primary action.
