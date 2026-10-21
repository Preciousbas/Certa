# Prompt 90 — Quality & operations: tests, Playwright journeys, CI, Sentry, health, admin (paste into a NEW Cursor chat)

## Context
Read `docs/spec/00_README.md`, `01_PRODUCT_SPEC.md` (§4 journeys), `02_DATA_AND_STATE.md`, `CODEBASE_MAP.md`. Prompts 10–80 are done and each added its own tests. This prompt makes quality systematic and the product operable: end-to-end journeys, CI gates, error tracking, alerting, a secure admin console, backups and legal placeholders.

## Goal
A broken change cannot reach `main`; production problems are detected within minutes; support can diagnose any project without touching money state by hand.

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
- Do **not** let admin tools edit balances, stage states or transactions directly. Admin can only *retry jobs*, *resend notifications*, *re-run reconciliation*, and *view*.
- Do **not** send real Telegram messages or real-money transactions from CI. E2E on staging uses a dedicated test bot token and Sepolia test wallets.
- Do **not** store photos/PII in Sentry (scrub request bodies, initData, cookies, headers).

## Step 1 — Inspect and report
Current test count/coverage per package, existing CI, Vercel environments (Production, Preview), whether a staging Supabase project exists. Report gaps, then implement.

## Step 2 — Test pyramid
- **Unit (Vitest)**: money, state machine, decision rules, validation rules V01–V18, RBAC matrix, message catalogue snapshot, initData verification. Coverage gate: `src/lib/**` and `src/server/**` ≥ 85% lines, `src/lib/money` and `src/server/stages` 100% branches.
- **Integration (Vitest + local Supabase via `supabase start` in CI)**: API routes with real DB + RLS, jobs, mocked AI providers (recorded fixtures) and mocked chain (anvil fork or viem test client).
- **Contracts (Foundry)**: from prompt 40, run in CI.
- **Bot handlers**: from prompt 60.
- **E2E (Playwright)** against a local stack (Next + Supabase + anvil with the escrow bytecode deployed + mocked AI + fake Telegram) — named journeys below — and a nightly run against **staging** (real Sepolia, test bot).
### Named Playwright journeys (`tests/e2e/journeys/`), each a `test.describe` with the steps as `test.step` names exactly:
1. `J2-intake.spec.ts` — "client uploads duplex_lekki_sample.xlsx" → "extraction completes" → "contract sum shows ₦55,255,000.00" → "9 stages listed and totals reconcile" → "client sends to contractor".
2. `J2-intake-messy.spec.ts` — upload messy CSV → 5 exact issue messages visible → Send disabled with "Fix 4 issues first" (V16 is a warning; count blocking only: V01, V02, V04, V05 = 4) → client fixes item 3.4 and VAT → reconciles.
3. `J4-acceptance.spec.ts` — contractor opens M4 (Mini App auth faked with a signed test initData) → sees identical content hash → Accept → both accepted → version immutable.
4. `J5-fund.spec.ts` — client funds part-payment up to stage 2 → tx confirmed on anvil → tiles show Locked = stages 1–2 amount.
5. `J6-capture-pass.spec.ts` — mocked geolocation within 40 m, clock now → 3 photos → mocked verdict pass 0.86 → stage "Waiting for consultant" → submit tx on anvil.
6. `J6-capture-reject.spec.ts` — location 600 m away → message C-3 exact; stale clock → C-5.
7. `J7-approve-over-cap.spec.ts` — consultant certifies → client Approve on a stage above cap → clientApprove + release txs → "Released" + Proof link; double-click Approve → still one release.
8. `J8-dispute.spec.ts` — client disputes → stage locked → time travel past decide_after → consultant decides "Pay the stage" → released.
9. `J9-variation.spec.ts` — contractor proposes "Second soakaway, ₦450,000" → client accepts → new version accepted by both → new stage exists.
10. `J11-weather.spec.ts` — Planning to pour → mocked x402 402→payment→200 → timeline shows "Agent paid 0.01 USDC for a weather check".
11. `security.spec.ts` — logged-out /admin → 404 page; contractor hitting client endpoints → 403; tenant B data invisible.
12. `ui-layout.spec.ts`, `a11y.spec.ts` — from prompt 80.

## Step 3 — CI (GitHub Actions `.github/workflows/ci.yml`)
Jobs on every PR and push to main: `install` (cache) → parallel `typecheck`, `lint`, `format:check`, `unit` (with coverage gate), `contracts` (foundry-toolchain, `forge test`), `integration` (supabase CLI `supabase start`, migrations, tests), `e2e` (Playwright, upload report + traces on failure), `build`, `secrets-scan` (gitleaks), `deps` (`pnpm audit --prod --audit-level=high`). Migrations check: `supabase db diff` must be empty after applying migrations. Branch protection on `main` (document the settings to click in GitHub; you cannot set them yourself): require all jobs, 1 review, linear history, no force-push. Vercel preview per PR; production deploy only from `main`. Nightly workflow: staging E2E + `verify-audit-chain` + reconciliation report. Note: the repo was not found on GitHub during the audit — if it isn't pushed yet, tell Precious the exact commands to create a **private** repo and push (`gh repo create certa --private --source=. --push`), and do not run them yourself.

## Step 4 — Observability
- Sentry (`@sentry/nextjs`) for server, edge and client; `SENTRY_DSN`, release = git sha, environment; `beforeSend` scrubs `authorization`, `cookie`, `initData`, `x-telegram-bot-api-secret-token`, request bodies on `/api/mini/*` and upload routes; tracesSampleRate 0.1; source maps uploaded but not public (keep the current 403 on maps).
- Structured logs (`pino`) with `requestId`, `userId`, `projectId`, `jobId`, `txHash`; no secrets/PII.
- `/api/health` (from prompt 10) + uptime monitor (Better Stack / UptimeRobot / Vercel Monitoring — pick and document) every 1 min, alert on 2 failures.
- Alerts (Sentry alerts or a `alerts` job posting to an **admin Telegram chat** set by `ADMIN_ALERT_CHAT_ID`): release_failed, reconciliation mismatch, job dead-lettered, x402 allowance > 80%, AI provider error rate > 20% over 15 min, health degraded, operator/agent wallet low balance (< 0.02 ETH / < 0.10 USDC).

## Step 5 — Admin console `/admin` (locked in prompt 20)
Pages: Projects search (name, id, user Telegram id) → project view: members, contract versions + hashes, stages with DB vs chain state side by side, audit log (read-only, hash-chain status), jobs (status, attempts, last error) with **Retry** (re-enqueue same dedupe key) and **Resend notification**, txs with explorer links, x402 spend, AI verdicts (raw JSON). Global: dead jobs, failed txs, alerts, agent wallet balances. Every admin action → audit_log `actor_kind='admin'` with reason (required text field).

## Step 6 — Data safety & compliance placeholders
- Supabase PITR/backups enabled (document plan level); monthly restore drill script `scripts/restore-drill.md` (manual steps).
- Migration rollback: every migration has a documented down path in `docs/ops/MIGRATIONS.md`; destructive migrations need two steps (expand → migrate → contract).
- Data retention: photos and documents kept 7 years after project close (construction records), configurable; account deletion request flow documented (manual for now).
- `/terms` and `/privacy` pages with clearly marked placeholder text "Draft — to be reviewed by a Nigerian lawyer before launch", covering NDPA 2023 (Nigeria Data Protection Act) basics: what we collect (Telegram id/name, photos with location, documents), why, retention, contact. KYC hook interface `src/server/kyc.ts` (no provider yet) for future cash-out.
- `docs/ops/RUNBOOK.md`: release failed, RPC down, AI provider down, Telegram webhook failing, wallet low, how to rotate each secret.

## Acceptance criteria
- [ ] CI workflow runs green on a PR (paste the run URL or local `act` output if the repo isn't on GitHub yet).
- [ ] Coverage gates met (paste summary).
- [ ] All 12 Playwright journeys pass locally; staging nightly configured.
- [ ] Sentry receives a test error from server and client with scrubbed headers (screenshot).
- [ ] Alert to admin Telegram chat fires for a simulated release_failed (staging).
- [ ] /admin shows DB vs chain for a project and Retry works for a dead job (test) — and there is no UI to edit money state.
- [ ] RUNBOOK, MIGRATIONS, terms/privacy placeholders exist.

## Definition of Done — run these commands and paste output
```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test -- --coverage
supabase start && pnpm db:migrate && pnpm test:integration && supabase db diff
cd contracts && forge test && cd ..
pnpm exec playwright test tests/e2e --reporter=list
npx gitleaks detect --no-banner --redact
pnpm audit --prod --audit-level=high
pnpm build
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
