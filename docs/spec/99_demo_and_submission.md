# Prompt 99 — Demo workspace, 2-minute demo, README and submission (paste into a NEW Cursor chat)

## Context
Read all of `docs/spec/`. Rise In **AgentMaxxing** final submissions close **25 Oct 2026** (Demo Day 30 Oct). Judges score the agent: the build, experimentation, crypto use, idea and docs. They will look for one real loop: **document → AI-extracted plan → both accept → escrow funded → site photos → AI verdict → submit on-chain → Approve above cap → release tx → x402 fee paid by the agent.** Everything shown must be real (testnet), never staged UI.

## Goal
A labelled demo workspace that runs the real loop on Sepolia, a recorded 2-minute demo following a fixed script, and a README that explains the product, architecture, AI decisions and security honestly.

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
- Do **not** add demo data to non-demo workspaces or show it to normal users. Demo workspace rows have `is_demo = true` and every demo page shows a slim banner "Demo workspace — test money on Ethereum Sepolia".
- Do **not** scale amounts or show "the real contract is ₦X" notes. Demo amounts are what's in the demo contract, end of story.
- Do **not** fake txs, verdicts or screenshots.

## Step 1 — Demo contract (realistic, small enough for test USDC)
Testnet USDC is limited (faucet amounts are small), so the funded demo uses a genuinely small job whose naira figures equal the escrowed USDC at the demo FX rate. Create `tests/fixtures/demo/gatehouse_sample_boq.pdf` + `.xlsx` (header "SAMPLE — fictitious, for Certa demo"):
*Repair of gatehouse and 20 m of block fence, Plot 14 (sample), Lekki Phase 1. Contract sum ₦26,622.20 incl. VAT. Retention 5%, defects period 3 months.* FX for the demo = ₦1,331.11 per USDC (fx_rates row source "Demo fixed rate", as_of 2026-10-15).
| Stage | ₦ | USDC | Tags | Note |
|---|---|---|---|---|
| 1. Setting out & excavation | 2,662.22 | 2 | — | |
| 2. Foundation concrete | 3,993.33 | 3 | concrete_pour | triggers x402 weather check |
| 3. Blockwork to lintel level | 9,317.77 | 7 | blockwork | **above the 5 USDC cap → needs Approve** |
| 4. Lintel & coping | 6,655.55 | 5 | concrete_pour | equal to cap → no extra approval |
| 5. Plastering & painting | 3,993.33 | 3 | plastering | |
| **Total** | **26,622.20** | **20** | | |
(Assert in a test: Σ naira = ₦26,622.20 and allocateMicro gives exactly 2/3/7/5/3 USDC.) Cap = 5 USDC. The BoQ items behind each stage must multiply out correctly (write them; e.g. Stage 3: 225 mm sandcrete blockwork 4.6 m² × ₦1,850.00 = ₦8,510.00 + mortar & labour item ₦807.77 → ₦9,317.77; Cursor: compose similar consistent lines for every stage and test them with the validator).
Also show (not fund) the **duplex BoQ** extraction from prompt 30 in the demo to prove full-size intake.

## Step 2 — Seed script `scripts/seed-demo.ts`
- Refuses to run without `--workspace-demo` and refuses if `NODE_ENV=production` unless `--i-understand-this-creates-a-demo-workspace` is also passed.
- Creates: demo workspace "Certa Demo", users "Demo Client", "Demo Contractor", "Demo Consultant" linked to Telegram test accounts given by env (`DEMO_CLIENT_TG_ID`, `DEMO_CONTRACTOR_TG_ID`, `DEMO_CONSULTANT_TG_ID`), memberships, CDP wallets per role (four distinct addresses printed), project with site GPS (env `DEMO_SITE_LAT/LNG` — use where you'll actually take photos), uploads the gatehouse documents through the **real** intake pipeline (not direct inserts), waits for extraction, then **stops** — acceptance, funding, photos and approvals are done live in the recording.
- `scripts/demo-preflight.ts`: checks wallet balances (client ≥ 20 USDC Sepolia + gas; operator gas; agent ≥ 0.1 USDC Base Sepolia), bot webhook info, health all ok, model ids reachable; prints a go/no-go table.

## Step 3 — 2-minute demo script (record with screen + phone mirror)
| Time | Show | Say (voice-over, verbatim) |
|---|---|---|
| 0:00–0:12 | Landing page | "Nigerian clients pay builders in advance and hope. Certa pays each stage only when the work is done, settled in a USDC escrow. An AI scores the photos. A person approves the money." |
| 0:12–0:35 | Telegram: client uploads gatehouse BoQ PDF → B-EX-1 → Mini App review with source chips; flash the duplex BoQ with an issue caught (item 3.4) | "The client uploads the contract. Certa reads every figure, cites the page, and checks the maths itself — here it caught a ₦270,000 error in a full duplex BoQ." |
| 0:35–0:50 | Contractor phone: B-AC-1 → Accept; B-AC-3 | "The contractor sees the identical plan and accepts. Both acceptances are fingerprinted." |
| 0:50–1:02 | Client funds 20 USDC → B-FU-2 with Etherscan link | "The client locks the money in an escrow on Ethereum. Each role has its own wallet — the contractor never touched crypto." |
| 1:02–1:25 | Contractor: Stage 3 photos via in-app camera (GPS + time stamp) → unsure verdict, reasons, confidence under 0.75 → consultant writes a reason and sends the stage on → submitStage tx | "The AI checks the photos against the stage checklist and flags what's missing. A person always approves the money." |
| 1:25–1:45 | Consultant certifies → client gets B-AP-2 (above cap) → Approve → B-AP-4 with Proof link → Etherscan showing release | "This stage is above the client's spending cap, so the client must approve. One tap, and the contractor is paid — here's the proof." |
| 1:45–1:55 | Stage 2/4 "Planning to pour" → B-WX-1 → Timeline "Agent paid 0.01 USDC for a weather check" + Basescan link | "Before a concrete pour the agent buys a weather forecast itself, paying with x402." |
| 1:55–2:00 | Timeline overview | "Every photo, verdict, approval and payment — on one record. That's Certa." |
Record a backup take. Upload to YouTube (unlisted) or Loom; put the link in README and on the landing page.

## Step 4 — README.md (replace the existing one; keep any still-true setup notes)
Sections, in order:
1. **Certa** — one-paragraph pitch (01 §1) + demo video link + live links (app, bot).
2. **The problem** (Nigerian construction payments: advances, abandoned sites, disputes without records) — 4 sentences, no invented statistics (cite a source for any figure or omit it).
3. **How it works** — the 3 steps + journey list.
4. **Architecture** — Mermaid diagram: Telegram (bot + Mini App) → Next.js on Vercel (API routes, jobs, cron) → Supabase (Postgres + RLS, private storage) ; → AI providers (document model, vision model) ; → CDP wallets → Ethereum Sepolia (EscrowFactory → per-project escrow clones, USDC) ; → x402 (Base Sepolia, facilitator) → paid weather endpoint. Plus a sequence diagram of the photo → verdict → submit → approve → release loop.
5. **How the AI decides** — document extraction (prompt version, schema, citations verified in code, validation rules V01–V18) and photo verification (capture checks, prompt version, schema, threshold T with the eval results table from `docs/eval/`), what the AI can and cannot do (never releases money).
6. **Experimentation** — summary of `docs/eval/extraction-*.md` and `vision-*.md`: models compared, accuracy, false-pass rate, cost/latency, what changed between prompt versions.
7. **On-chain** — contract addresses with Etherscan links (factory, demo escrow), functions used, cap/approve logic, retention, disputes; x402 network note (Base Sepolia); Foundry test summary; CONTRACT_REVIEW.md link.
8. **Security model** — Telegram auth (HMAC + freshness), RBAC + RLS, separate wallets per role (and the honest custody note from prompt 40), idempotent tx service, audit hash chain, what's still testnet/not audited.
9. **Run it locally** — prerequisites, `cp .env.example .env.local`, `supabase start`, `pnpm db:migrate`, `pnpm dev`, bot webhook via tunnel, `pnpm seed:demo -- --workspace-demo`.
10. **Env vars** — table from `.env.example`.
11. **Demo steps** — Step 3 table condensed.
12. **Roadmap / not done** — cash-out partner, mainnet, self-custody, materials prices, Nigerian legal review — honest.

## Step 5 — Submission checklist (`docs/SUBMISSION.md`)
- [ ] Repo public **or** judges given access (Precious decides; do not change visibility yourself) with README as above.
- [ ] Demo video ≤ 2:00 (or the platform's limit — check the Rise In submission page) linked.
- [ ] Live app + bot work for a fresh judge account: landing → Open in Telegram → "How Certa works" → join the read-only **demo viewer** code printed by the seed (`viewer` role on the demo project).
- [ ] All tx links in README open on Etherscan/Basescan.
- [ ] Final report `docs/FINAL_REPORT.md`: what's done, coverage, open risks, what couldn't be completed and why.
- [ ] Precious submits on the Rise In platform before 25 Oct 2026 (Cursor cannot do this).

## Acceptance criteria
- [ ] Seed + preflight scripts run clean; preflight table all "go".
- [ ] One full live run recorded with real tx links for: escrow creation, fund, submitStage, clientApprove, releaseStage, x402 payment (list all six links).
- [ ] Demo banner visible on every demo-workspace page; no demo data in any other workspace (SQL check).
- [ ] README renders with both Mermaid diagrams and all sections; eval numbers match the committed reports.

## Definition of Done — run these commands and paste output
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm tsx scripts/seed-demo.ts --workspace-demo
pnpm tsx scripts/demo-preflight.ts
psql "$DATABASE_URL" -c "select count(*) as non_demo_rows_from_seed from projects p join workspaces w on w.id=p.workspace_id where w.is_demo=false and p.name ilike '%sample%';"
grep -n "etherscan.io\|basescan.org" README.md
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
