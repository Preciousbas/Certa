# Prompt 10 — Foundations (paste this whole file into a NEW Cursor chat)

## Context
You are the lead engineer on **Certa**: a Telegram AI site-engineer agent (bot @CertaApp_bot + Telegram Mini App + web dashboard at https://certa-two.vercel.app) that holds Nigerian construction money in a USDC escrow on Ethereum Sepolia and releases each stage only when photo evidence passes an AI check and the client/consultant approves. Treat it as a real-money product.

Read these first, completely: `docs/spec/00_README.md`, `docs/spec/01_PRODUCT_SPEC.md`, `docs/spec/02_DATA_AND_STATE.md`.

Known from a black-box audit on 20 Oct 2026 (confirm each in code; do not trust blindly):
- Next.js app deployed on Vercel. `/api/health` currently returns `db`, `storage`, `rpc`, `usdc`, `cdp`, `contract` keys.
- Supabase is used for DB and storage. CDP (Coinbase Developer Platform) server wallets are configured.
- Telegram webhook is probably `POST /api/telegram` (GET returns 405). Mini App APIs live under `/api/mini/*` and return 401 without Telegram auth.
- EscrowFactory `0x4F4c6cc95465ceFe8a967E351EEdE69d40660423` and escrow `0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d` on Ethereum Sepolia (chainId 11155111).
- The UI shows a seeded project "EM 22 — 4-Bedroom Duplex, Lekki Phase 1, Lagos", a "written contract is ₦45,000,000" note, a seeded dispute ("Released in full") and a seeded 600 USDC / ₦900,000 "Extra soakaway" change, hard-coded daily notes, and two FX rates (≈₦1,500 and ₦1,331.11).

## Goal
A clean, strict, persistent foundation that every later prompt builds on: an accurate map of the code, strict TypeScript, validated env, the full schema from 02 with RLS, private object storage, a bigint money library, a job queue/outbox, one FX source, the stage state-machine module, the audit log, and **all seeded data removed from production paths**.

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

## Step 1 — Inspect and report (no code changes yet)
Run and read, then write `docs/spec/CODEBASE_MAP.md` containing:
1. Framework versions (`package.json`), package manager (from lockfile), Node version, router type (app/pages), folder tree to depth 3 (exclude node_modules/.next).
2. Every route: page routes and API routes, with method(s), auth check used, and data source (DB table, chain call, or **hard-coded/seed** — flag these).
3. Telegram bot: library (grammY/telegraf/other), entry file, every command and callback handler that exists.
4. Contracts: is there a `contracts/` (Foundry/Hardhat) folder? ABI files used by the app? Which addresses are read from env vs hard-coded?
5. Data layer: Supabase client usage, existing tables/migrations, ORM if any, what "storage: memory" in /api/health refers to.
6. Every env var referenced in code (`grep -rn "process.env" src app lib`), and where.
7. **Every place seed/demo/hard-coded data lives**: search for `45,000,000`, `45000000`, `EM 22`, `Lekki`, `soakaway`, `0.78`, `Released in full`, `1500`, `1331`, `seed`, `demo`, `mock`, `sample`. List file:line for each.
8. Existing tests and CI.
Stop and show me CODEBASE_MAP.md before continuing **only if** something fundamental contradicts this prompt (e.g. not Next.js, not Supabase). Otherwise continue.

## Step 2 — Requirements
### 2.1 Tooling
- `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"exactOptionalPropertyTypes": false` (leave false), path alias `@/*` → `src/*` (or the existing root if no `src/`; record the decision in CODEBASE_MAP.md).
- ESLint (flat config) with `@typescript-eslint/recommended-type-checked`, `no-floating-promises`, `eqeqeq`, and a custom `no-restricted-syntax` rule that errors on `parseFloat`, `Number(`, `toFixed(` and arithmetic on identifiers matching `/(Kobo|Micro|kobo|micro)$/` unless typed `bigint` (implement as a small local ESLint rule in `eslint-rules/no-float-money.js` with tests).
- Prettier (default config + `printWidth: 100`). Scripts in package.json: `typecheck`, `lint`, `format:check`, `test`, `test:integration`, `build`, `db:migrate`, `db:reset` (local only), `seed:demo`.
- Vitest for unit/integration tests. Put unit tests next to code as `*.test.ts`; integration tests in `tests/integration/`.

### 2.2 Env validation
- `src/env.ts` (server) and `src/env.client.ts` (only `NEXT_PUBLIC_*`) with Zod. Import `env` everywhere instead of `process.env`. The app must **fail at boot** with a clear message listing missing/invalid vars (never their values).
- Required server vars (rename to match existing names you found; list the mapping): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` (=CertaApp_bot), `APP_URL`, `CHAIN_ID` (11155111), `RPC_URL`, `RPC_URL_FALLBACK`, `USDC_ADDRESS`, `ESCROW_FACTORY_ADDRESS`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AI_DOC_PROVIDER`, `AI_DOC_MODEL`, `AI_DOC_FALLBACK_MODEL`, `AI_VISION_PROVIDER`, `AI_VISION_MODEL`, `AI_VISION_FALLBACK_MODEL`, provider keys (`OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` and/or `GOOGLE_API_KEY` — at least the ones the chosen providers need), `SESSION_SECRET` (≥32 bytes), `ADMIN_TELEGRAM_IDS` (comma list), `SENTRY_DSN` (optional until prompt 90), `SUPPORT_EMAIL`, `FX_SOURCE` ("manual"|"api"), `FX_MANUAL_KOBO_PER_USDC` (e.g. 133111), `FX_MANUAL_AS_OF` (YYYY-MM-DD), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Vars for later prompts can be `optional()` now with a TODO naming the prompt.
- `.env.example` with every var, a one-line comment each, placeholder values only.

### 2.3 Database
- Implement every table, constraint, index, trigger and RLS policy in `docs/spec/02_DATA_AND_STATE.md` as migrations. Write `docs/spec/SCHEMA_DIFF.md` first (02 says how).
- Generated TypeScript types for the DB (`supabase gen types` or ORM types) committed to `src/server/db/types.ts`.
- `src/server/db/client.ts`: server-only (import `server-only`), service-role client; never imported by client components (add an ESLint `no-restricted-imports` rule for `@/server/**` in `app/**/page.tsx` client components and `src/components/**`).
- Immutability triggers for `contract_versions` and `audit_log` as specified.

### 2.4 Object storage
- Supabase Storage buckets `documents`, `photos`, `certificates`, `letterheads`: **private**. `src/server/storage.ts` with `putObject({bucket, key, bytes, contentType, sha256})` (verifies hash), `signedUrl(bucket, key, ttlSeconds=300)`, `getObject`. Key format: `<workspaceId>/<projectId>/<yyyy>/<mm>/<uuid>.<ext>`.
- `/api/health` must report `storage: "supabase"` (not `memory`) after this prompt. Remove the in-memory store from production paths; if tests need it, move it to `tests/fakes/`.

### 2.5 Money library `src/lib/money/`
- `kobo.ts`: `parseNaira("₦1,350,000.50") → 135000050n`; accepts `₦`, `N`, `NGN`, commas, spaces, up to 2 decimals; rejects anything else with `InvalidMoney`. `formatNaira(135000050n) → "₦1,350,000.50"`.
- `usdc.ts`: `parseUsdc("20.5") → 20500000n`; `formatUsdc(20500000n, {dp:2}) → "20.50 USDC"`, full 6dp mode.
- `fx.ts`: `koboToMicro(kobo, koboPerUsdc)` = floor; `allocateMicro(kobos: bigint[], koboPerUsdc) → bigint[]` (largest remainder; sum equals `koboToMicro(sum)`); `microToKobo` (round half up).
- `percent.ts`: `applyBps(amount, bps)` round half up.
- Unit tests must include these exact cases:
  - `koboToMicro(266222n, 133111n) === 2000000n` (₦2,662.22 = 2 USDC at ₦1,331.11) and `koboToMicro(2662220n, 133111n) === 20000000n` (₦26,622.20 = 20 USDC).
  - `allocateMicro([268750000n,1134856000n,625574750n,1053500000n,666500000n,800875000n,419250000n,190694250n,365500000n], 133111n)` returns `[2018991669n,8525636499n,4699647287n,7914447341n,5007099338n,6016595172n,3149627003n,1432595728n,2745828669n]` and sums to `41510468706n`.
  - `applyBps(5525500000n, 500) === 276275000n` (5% retention of ₦55,255,000 = ₦2,762,750).
  - `applyBps(5140000000n, 750) === 385500000n` (7.5% VAT of ₦51,400,000 = ₦3,855,000).
  - `parseNaira("1,350,000") === 135000000n`; `parseNaira("1.350.000")` throws.

### 2.6 FX — one source
- `src/server/fx.ts`: `getActiveRate()` returns `{koboPerUsdc: bigint, source: string, asOf: string}` from `fx_rates` (latest row). Seed one row from `FX_MANUAL_KOBO_PER_USDC`/`FX_MANUAL_AS_OF` via migration-safe upsert at boot (not a hard-coded constant in UI code). Contract versions copy the rate at acceptance and every project page uses **the version's** rate.
- Remove every other FX constant (the ≈1500 one and any inline 1331.11). Grep proves it (DoD).

### 2.7 Jobs / outbox
- `jobs` table (02). `src/server/jobs/enqueue.ts` (inside a DB transaction, dedupe by `dedupe_key`), `src/server/jobs/worker.ts` with handlers registry, exponential backoff (30s, 2m, 10m, 1h, 6h → `dead`), and a Vercel Cron route `GET /api/cron/jobs` (protected by `CRON_SECRET` header, add env var) running every minute that drains up to 20 jobs within 50 s. If the repo already uses Inngest/QStash, use that instead and document it. Handlers must be idempotent.

### 2.8 State machine + audit
- `src/server/stages/transition.ts` exactly per 02 §4, with the transition table as data and an exhaustive test (every illegal pair throws).
- `src/server/audit.ts` `audit({action, entity, entityId, before, after, actor, reason, requestId})`; hash chain trigger per 02 §5; `scripts/verify-audit-chain.ts`.

### 2.9 Remove seed data from production paths
- Delete or move every item listed in CODEBASE_MAP.md §7 out of production code. Pages that relied on it must render real **empty states** from 01_PRODUCT_SPEC.md (e.g. Timeline empty: "Nothing has happened on this project yet. Upload the contract or BoQ to begin.").
- Create `scripts/seed-demo.ts` stub that refuses to run unless `--workspace-demo` flag is passed and writes only `is_demo=true` workspaces (filled in by prompt 99).
- The pilot escrow 0x5289… must no longer be presented as "the contract". It may appear only inside the demo workspace once prompt 99 runs.

### 2.10 Health
`GET /api/health` returns JSON `{status:"ok"|"degraded", version (git sha), db, storage, rpc, chainId, usdc, factory, cdp, ai_doc, ai_vision, x402, queue:{queued, dead}, time}` — each component `ok|error|unconfigured`, no secrets, 200 when all required are ok else 503. Keep existing keys working (add, don't rename) so any external monitor keeps working.

## File/folder conventions
```
src/
  app/                 # Next.js routes (keep existing layout; record if it's ./app instead)
  components/          # UI only, no server imports
  lib/money/           # pure, isomorphic, bigint
  lib/validation/      # shared zod schemas
  server/              # server-only: db, storage, auth, stages, chain, ai, bot, jobs, fx, audit
  bot/                 # Telegram handlers (if not already elsewhere — keep existing location)
supabase/migrations/   # SQL, timestamped
scripts/               # seed-demo.ts, verify-audit-chain.ts, eval-*.ts
tests/integration/  tests/e2e/  tests/fixtures/
docs/spec/             # this pack + CODEBASE_MAP.md, SCHEMA_DIFF.md, BACKLOG.md
```
If the repo uses a different layout, keep it and map these names to it in CODEBASE_MAP.md. Do not mass-move files.

## Acceptance criteria
- [ ] `docs/spec/CODEBASE_MAP.md` and `docs/spec/SCHEMA_DIFF.md` exist and are accurate.
- [ ] `strict` TypeScript passes with zero errors; ESLint passes with zero errors; the no-float-money rule has its own passing tests.
- [ ] Booting with a required env var missing prints `Invalid environment: TELEGRAM_BOT_TOKEN is required` (name only) and exits non-zero.
- [ ] All 02 tables exist with RLS enabled on every one (query proof in DoD).
- [ ] `update audit_log …` and `delete from audit_log …` fail even with the service role; `verify-audit-chain` reports OK.
- [ ] Money library tests above pass, exact values.
- [ ] State machine test proves every legal transition passes and every other pair throws.
- [ ] `/api/health` shows `storage: "supabase"`, `factory` ok, and no secret values.
- [ ] Grep finds **no** seed strings in production paths (command in DoD returns nothing outside `scripts/`, `tests/`, `docs/`).
- [ ] Exactly one FX source: grep for `1500` / `1331` in `src` returns nothing except tests.
- [ ] Every existing working feature listed in the do-not-do list still works (state how you checked each).

## Definition of Done — run these commands and paste output
Use the repo's package manager (written as `pnpm` below; substitute if it's npm/yarn/bun).
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test -- --reporter=verbose src/lib/money src/server/stages eslint-rules
pnpm test:integration
pnpm build
# RLS on every public table (expect zero rows):
psql "$DATABASE_URL" -c "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"
# audit log is append-only (both must ERROR):
psql "$DATABASE_URL" -c "update audit_log set action='x' where id=(select min(id) from audit_log);"
psql "$DATABASE_URL" -c "delete from audit_log where id=(select min(id) from audit_log);"
pnpm tsx scripts/verify-audit-chain.ts
# no seed data in production paths (expect no output):
grep -rnE "45,?000,?000|EM 22|soakaway|Released in full|0\.78|1331\.11|\b1500\b" src app lib 2>/dev/null | grep -vE "\.test\.|/tests?/|/fixtures/"
# health (local dev server running):
curl -s localhost:3000/api/health | jq .
git status --short && git log --oneline -5
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
