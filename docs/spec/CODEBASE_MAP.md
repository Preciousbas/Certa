# Codebase map

Inspected 21 Oct 2026. `docs/spec/00_README.md`, `01_PRODUCT_SPEC.md`, and `02_DATA_AND_STATE.md` are not in this repo. The notes below are from the code, not from that pack.

## Layout decision

This is a pnpm workspace, not a single `src/` app. Existing folders stay where they are.

| Prompt path      | This repo                                                |
| ---------------- | -------------------------------------------------------- |
| `src/app`        | `apps/web/app` (Next.js App Router)                      |
| `src/components` | `apps/web/components`                                    |
| `src/lib/money`  | `src/lib/money` (new pure library)                       |
| `src/server`     | `src/server` plus existing `packages/db`, `apps/web/lib` |
| bot              | `apps/bot/src/bot.ts`                                    |
| migrations       | `packages/db/migrations`                                 |

`@/*` was not added. Imports stay `@certa/*` and relative. Moving every file onto `@/*` would be a mass move.

## Tooling

- Node v20.20.0. Package manager pnpm 10.18.2 (`packageManager` and `pnpm-lock.yaml`).
- Next.js 15.5.27, React 19.2.4, TypeScript 5.9.3, Vitest 3.2.4, Drizzle 0.45.4, grammY 1.46.0, Foundry contracts.
- `tsconfig.base.json` already has `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `exactOptionalPropertyTypes: false`.
- App Router only. No `pages/` router.

## Tree (depth 3, excluding node_modules and .next)

`apps/web` (app, components, e2e, lib), `apps/bot/src`, `packages/{ai,chain,db,pdf,shared}`, `contracts/{src,script,test}`, `docs`, `fixtures`, `scripts`, `src`, `supabase` is not a folder. SQL lives in `packages/db/migrations`.

## Routes

Pages under `apps/web/app`: `/`, `/stages`, `/capture`, `/fund`, `/changes`, `/wallet`, `/report`, `/billing`, `/cashout`, `/admin`, `/upload`, `/certificate`. They call `loadProject()` (Postgres). No page has its own auth cookie. The shell is the Mini App.

| API                                              | Method | Auth                                      | Data                                       |
| ------------------------------------------------ | ------ | ----------------------------------------- | ------------------------------------------ |
| `/api/health`                                    | GET    | none                                      | DB ping, chain probe, factory address      |
| `/api/telegram`                                  | POST   | webhook secret header                     | bot handlers. GET is not implemented (405) |
| `/api/mini/*`                                    | POST   | `withAuth` → 401 "Sign in from Telegram." | DB + chain fund/release                    |
| `/api/paid/weather`, `/api/paid/materials-price` | GET    | x402                                      | project row, not a hard-coded amount       |
| `/api/contract/preview`                          | POST   | none                                      | file parse, no DB write                    |
| `/api/files`                                     | GET    | signed query                              | legacy blob table                          |
| `/api/cron/jobs`                                 | GET    | `CRON_SECRET`                             | `jobs` table                               |

`/api/mini/*`: fund, review, capture, changes, dispute, release, plan, nonce, admin, cashout.

## Bot

grammY in `apps/bot/src/bot.ts`. Local process is `apps/bot/src/poll.ts`. Production entry is `POST /api/telegram`.

Commands: `/start`, `/join`, `/accept`, `/help`, `/project`, `/stages`, `/switch`, `/submit`, `/wallet`, `/dispute`, `/changes`, `/report`.

Callbacks: `go-join`, `sw:`, `adv`. Document messages start contract intake.

## Contracts

Foundry in `contracts/`. `CertaEscrow.sol`, `EscrowFactory.sol`. ABI is used from `packages/chain`. Factory and escrow addresses: env first (`ESCROW_FACTORY_ADDRESS`, `ESCROW_ADDRESS`), with published Sepolia fallbacks in `apps/web/lib/published-chain.ts`. The pilot address is not linked from the shell.

## Data

- ORM: Drizzle. Client: `postgres` when `DATABASE_URL` is set, otherwise PGlite in memory.
- Object storage is the private Supabase buckets `documents`, `photos`, and `certificates`. `src/server/storage.ts` writes them with the service role and returns signed URLs. `/api/health` reports `storage: "ok"` only after those three buckets exist and `public` is false. When `SUPABASE_SERVICE_ROLE_KEY` is unset, that check reads `storage.buckets` through the database.
- The `blobs` table remains because older contract uploads stored bytes there. New object writes do not use it.
- One queue: the `jobs` table, drained by `GET /api/cron/jobs`. The Inngest timers did not read that table, so the route and the two timer functions were removed. A job finishes as `succeeded`.

## Env vars read in code

`DATABASE_URL`, `DEMO_SEED`, `DEMO_MODE`, `APP_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `ESCROW_FACTORY_ADDRESS`, `ESCROW_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, `EVM_PRIVATE_KEY`, `X402_FACILITATOR_URL`, `X402_PAY_TO_ADDRESS`, `CLIENT_ADDRESS`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_VISION_MODEL`, `LLM_TEXT_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, `BLOB_READ_WRITE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITEST`, `NODE_ENV`, `VERCEL_GIT_COMMIT_SHA`, `CRON_SECRET`, `FX_SOURCE`, `FX_MANUAL_KOBO_PER_USDC`, `FX_MANUAL_AS_OF`, `ENFORCE_ENV`.

`assertServerEnv` maps `NEXT_PUBLIC_APP_URL` → `APP_URL`, `SEPOLIA_RPC_URL` → `RPC_URL`, and `LLM_*` → `AI_DOC_*` / `AI_VISION_*`. It runs only when `ENFORCE_ENV=1`, so a missing new variable does not take down the current deploy. `VERIFY_PASS_THRESHOLD` is optional and defaults to 0.75 (bounds 0.6–0.95).

## Capture as found

Inspected before the photo-verification work. Paths are the ones in this repo.

- The camera page is `apps/web/app/capture/page.tsx`, not `/mini/capture`. It picks the first stage in review, or otherwise the first stage that is not released, and renders `apps/web/components/camera.tsx`.
- The camera calls `getUserMedia({ video: { facingMode: "environment" } })` with no ideal width. It draws the frame to a canvas and encodes JPEG at quality 0.9. There is no `<input type="file">`. A nonce is requested on each shutter press, not when the page opens.
- `POST /api/mini/nonce` stores a sha256 of a 16-byte nonce, expires it after 5 minutes, and returns `{ nonce }` with no `expiresAt`. It checks the contractor or assigned subcontractor. It does not check the stage state.
- `POST /api/mini/capture` marks that nonce used on the first photo. It reads JPEG EXIF with `readJpegExif` (`packages/shared/src/exif.ts`). `evaluatePhoto` (`packages/shared/src/photos.ts`) wants an EXIF time within 30 minutes, a GPS point inside `projects.geofence_radius_m`, and rejects a sha256 already in `photos`. There is no accuracy cap, no 10-minute freshness rule, no perceptual-hash distance, and no Laplacian check. `exif_present` is required by that older function, so a canvas JPEG with the EXIF stripped is refused unless the test path is bypassed.
- A passing photo is stamped with `sharp` (`apps/web/lib/stamp-photo.ts`) and written under `var/photos/`. The bytes are not put in the private `photos` bucket on this path. The route then calls `@certa/ai` `verifyStage`. If the decision is `recommend_release` and the project has an escrow address, it calls `broadcastStageRelease`, which sends `submitStage` and then `releaseStage`. That is the behaviour this prompt removes: the model must not release money.
- `recordCaptureOutcome` can walk a pass all the way to `released`.
- There is no `ai_verdicts` table. `submissions` has no `status`. `photos` has no `stage_id`, `accuracy_m`, `distance_from_site_m`, or `nonce`. The site radius column is `geofence_radius_m`, not `site_radius_m`.
- No IndexedDB queue. No `/mini/capture` page. No `verify_stage` job. No `src/server/verify`. The seeded 0.78 confidence string is not in the capture page; a stored submission still renders `AICheckCard` with a hard-coded threshold of 0.85.

## Seed and hard-coded business data

Production pages skip `terms_hash = seeded-terms` unless `DEMO_SEED=true`, and then the shell says "Demo workspace". Boot no longer calls `seedDemo`. The Lekki figures remain in `packages/db/src/seed.ts` and `packages/shared/src/stages.ts` for tests and a later demo script. `scripts/seed-demo.ts` refuses to run without `--workspace-demo` and writes nothing yet.

## Tests and CI

Vitest per package, Playwright in `apps/web/e2e`, Foundry in `contracts/test`. No `.github/workflows` directory.

## Auth as found

Inspected before the auth changes. Paths are the ones in this repo, not a single `src/app`.

### Mini App `/api/mini/*`

- `apps/web/lib/with-auth.ts:40-70` wraps every mini route. No `Authorization` header, or a failed check, returns 401 `{ "error": "Sign in from Telegram." }`.
- `apps/web/lib/telegram-auth.ts:6-18` reads `Authorization: tma <initData>`.
- `packages/db/src/telegramAuth.ts:19-39` does check the HMAC (`WebAppData` then HMAC-SHA256, constant-time compare) and `auth_date`. The window is 24 hours, and `auth_date` more than 60 seconds in the future is rejected. There is no 1 hour default.
- The user row must already exist (`with-auth.ts:48-49`). Nothing writes `telegram_identities`.
- Project and role are checked (`with-auth.ts:66-70`) from `parties` plus a workspace `admin` flag in `rolesOnProject` (`with-auth.ts:28-37`). `memberships` is not read. The browser can send `projectId`, and the role is not taken from that body, but it is also not taken from `memberships`.
- No session cookie is set.

### `/admin`

- `apps/web/app/admin/page.tsx:8` renders for anyone. It calls `loadProject()` and shows spend, disputes, and failed releases. There is no layout gate, no middleware, and no `/api/admin`.

### Webhook

- `apps/web/app/api/telegram/route.ts:9-14` returns 503 when the token or secret is unset, and 401 `"unauthorized"` when `X-Telegram-Bot-Api-Secret-Token` is not `===` the secret. That compare is not constant-time. The body is not empty.
- `update_id` is not stored. `telegram_updates` exists in `packages/db/migrations/0003_spec_schema.sql:219` and is unused. There is no `scripts/set-webhook.ts`.

### Session

- No `certa_session` cookie, no iron-session, no jose JWE, no `/login`, no `/api/auth/logout`.
- Rate limit is an in-memory 30/minute bucket in `apps/web/lib/rate-limit.ts:10-18`, with the message "Too many requests. Wait a minute."
- `users.platform_role` is not a column. `ADMIN_TELEGRAM_IDS` and `SESSION_SECRET` are in `src/env.ts` and `.env.example` only.

## Intake as found

Inspected before the contract and BoQ intake work. Paths are the ones in this repo.

### Contract and stage creation

- `packages/db/src/services.ts` `recordUploadedContract` writes a project, stages, a `documents` row (`kind` contract), a `blobs` row, and a `contract_summaries` row. That path is still the one the bot uses when the chat is not waiting for documents.
- `apps/web/app/upload/page.tsx` exists. It posts a file to `/api/contract/preview` and does not write a document row. `/contract`, `/new`, and `/projects` are not App Router pages. The new pages are `/app/p/[projectId]/documents`, `/app/p/[projectId]/contract/review`, `/app/p/[projectId]/contract`, and `/mini/contract`.
- `documents` started as `id, project_id, workspace_id, kind, storage_key, sha256, parsed_json, parse_status`. Intake columns were added in `0005_intake.sql` rather than replacing that table. `document_chunks`, `extractions`, `contract_versions`, `contract_acceptances`, and `boq_items` already existed in `0003_spec_schema.sql`. Drizzle did not map the chunk, extraction, or BoQ tables until this work.
- Stage money columns are `amount_ngn_kobo` and `amount_usdc` (micro). `on_chain_idx` is required. `0005` adds `contract_version_id`, `kind`, `acceptance_criteria`, and `tags` with defaults so older inserts still work.
- `projects.status` was `draft|active|paused|closed`. `0005` adds `awaiting_acceptance` and `completed`, plus `current_contract_version_id`.
- `contract_versions` is immutable except the status moves in the `contract_versions_immutable` trigger: `pending_acceptance` to `accepted` or `draft`, and `accepted` to `superseded`. Draft content cannot be updated in place, so review edits stay on `extractions.validated_json` until Send.

### Bot files

- `apps/bot/src/bot.ts` treated every document as the older contract conversation, capped at 8 MB, studied by `@certa/ai`, and accepted with a typed reply plus contractor `/accept` (`acceptContractSide`). There was no `awaiting_documents` state until `bot_sessions.state` and `state_expires_at` in `0005`.
- The new path runs only while that state is set. Otherwise the 8 MB conversation stays.

### acceptTerms

- `contracts/src/CertaEscrow.sol` `acceptTerms()` takes no arguments and no content hash. It sets `clientAccepted` or `contractorAccepted` from `msg.sender`. `termsHash` is set in the constructor. `fund()` reverts until both have called it. Retention is a single release after the defects period. Intake does not call the chain. It enqueues `accept_terms_deferred` for prompt 40.

### Duration and plan

- The Vercel team is Hobby. Hobby function `maxDuration` tops out at 300 seconds. `GET /api/cron/jobs` sets `maxDuration` to 300. `apps/web/vercel.json` crons that route at `0 0 * * *`, which is the Hobby schedule limit of once a day. The bot process in `apps/bot/src/poll.ts` drains one queued job at a time, including `verify_stage`. Sending photos only queues that job. The worker writes `ai_verdicts` when the model returns, and the stage page reads that row. A vision call aborts after 240 seconds. A timeout is stored as unsure and the stage moves to `needs_more_evidence`, which the consultant override can send on.

## What differed from the prompt

- Not a single `src/` Next app. Supabase is Postgres via `DATABASE_URL`, not a Supabase Storage SDK.
- Spec pack 00/01/02 is missing, so table names from 02 were not invented. See `SCHEMA_DIFF.md`.
- Inngest is already mounted. The outbox was still added because health needs `queue.queued` / `queue.dead` and Inngest is not wired to those rows.
- Stage names in the database are `pending | funded | submitted | released | disputed`, not the longer list from an earlier brief. The state machine uses the statuses the app writes.
