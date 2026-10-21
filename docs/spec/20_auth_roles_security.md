# Prompt 20 — Auth, roles and security (paste into a NEW Cursor chat)

## Context
Certa (see `docs/spec/01_PRODUCT_SPEC.md`, `docs/spec/02_DATA_AND_STATE.md`, `docs/spec/CODEBASE_MAP.md`). Prompt 10 is done: strict TS, env validation, full schema with RLS, storage, money lib, jobs, state machine, audit.
Audit findings to fix: `/admin` opens for anyone with no login; client, consultant and operator are one server wallet (wallet split is prompt 40, but **role checks** are here); `/api/mini/*` returns 401 without auth but initData HMAC + `auth_date` freshness + project scoping are unverified; webhook secret handling unverified.

## Goal
Every request is authenticated, every action is authorised by project role on the server, tenants are isolated, the webhook is hardened, `/admin` is locked, and tests prove it.

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
- Do **not** trust any role, project id or user id sent from the browser. Derive the user from the verified session and look up roles in `memberships`.
- Do **not** log `initData`, cookies, tokens or Telegram hashes.

## Step 1 — Inspect and report
List in `docs/spec/CODEBASE_MAP.md` (new section "Auth as found"): how `/api/mini/*` currently validates Telegram (file:line), whether it checks the HMAC, `auth_date`, and project/role; how `/admin` is served; how the webhook route checks `X-Telegram-Bot-Api-Secret-Token`; any session/cookie code. Then implement below, reusing what is correct.

## Step 2 — Requirements
### 2.1 Telegram Mini App auth
- `src/server/auth/telegramInitData.ts`: `verifyInitData(raw: string, botToken, maxAgeSec = 3600)`. Algorithm (Telegram spec): parse query string; remove `hash`; sort remaining `key=value` pairs alphabetically; join with `\n` → data_check_string; `secret = HMAC_SHA256(key="WebAppData", msg=botToken)`; `expected = hex(HMAC_SHA256(key=secret, msg=data_check_string))`; constant-time compare with `hash`; reject if `now - auth_date > maxAgeSec` or `auth_date` is > 60 s in the future. Return the parsed `user`.
- Mini App client sends `Authorization: tma <initData>` on every `/api/mini/*` call. Server: verify → upsert `telegram_identities`/`users` → set session.
- Error responses (JSON, exact): 401 `{ "error": "not_signed_in", "message": "Sign in from Telegram." }` (keep existing text), 401 `{ "error": "session_expired", "message": "Your session has expired. Close and reopen Certa in Telegram." }`, 403 `{ "error": "forbidden", "message": "You don't have permission to do this on this project." }`.

### 2.2 Web login
- `/login`: Telegram Login Widget for `@CertaApp_bot` (domain must be set with BotFather `/setdomain` → `certa-two.vercel.app`; add this as a manual step in your report). Verify widget data server-side: `secret = SHA256(botToken)`, HMAC-SHA256 of the sorted `key=value\n` string, `auth_date` ≤ 24 h.
- Session: signed, encrypted httpOnly cookie `certa_session` (iron-session or jose JWE using `SESSION_SECRET`), `Secure`, `SameSite=Lax`, 7-day absolute expiry, 24 h idle expiry, rotated on login. Logout route `POST /api/auth/logout`.
- If the app uses Supabase RLS from the browser, mint a short-lived (15 min) Supabase JWT with `sub=users.id` server-side; otherwise all reads go through server routes. Report which you chose and why.

### 2.3 RBAC (server-side, one place)
- `src/server/auth/rbac.ts`: `requireMember(projectId, roles?: Role[])` → returns `{user, membership}` or throws 403. `requirePlatformAdmin()`.
- Permission matrix (implement as data + test every cell):

| Action | client | consultant | contractor | subcontractor | viewer |
|---|---|---|---|---|---|
| view project, stages, timeline | ✓ | ✓ | ✓ | own stages only | ✓ |
| upload documents / run extraction / edit draft stages | ✓ | ✓ (upload only) | ✗ | ✗ | ✗ |
| send contract for agreement | ✓ | ✗ | ✗ | ✗ | ✗ |
| accept / request change on contract | ✓ (client side) | ✗ | ✓ (contractor side) | ✗ | ✗ |
| fund escrow | ✓ | ✗ | ✗ | ✗ | ✗ |
| submit stage photos | ✗ | ✗ | ✓ | ✓ assigned | ✗ |
| certify / reject stage | ✗ | ✓ | ✗ | ✗ | ✗ |
| approve / decline release | ✓ | ✗ | ✗ | ✗ | ✗ |
| open dispute | ✓ | ✗ | ✓ | ✗ | ✗ |
| decide dispute (after N days) | ✗ | ✓ | ✗ | ✗ | ✗ |
| propose variation | ✓ | ✓ | ✓ | ✗ | ✗ |
| accept/decline variation | ✓ (if proposed by contractor) | ✗ | ✓ (if proposed by client/consultant) | ✗ | ✗ |
| invite people, settings, pause | ✓ | ✗ | ✗ | ✗ | ✗ |
| view audit log | ✓ | ✓ | ✗ | ✗ | ✗ |

- Every API route and every bot handler calls `requireMember` (bot: map Telegram user → user). Add a test that enumerates all route files under `app/api/**` and fails if a route doesn't call an auth helper (allowlist only: `/api/health`, `/api/telegram` (webhook secret instead), `/api/cron/*` (cron secret), `/api/paid/*` (x402 payment instead), `/api/auth/*`).

### 2.4 /admin lock
- `/admin/**` pages and `/api/admin/**`: require session user whose Telegram id is in `ADMIN_TELEGRAM_IDS` **and** `users.platform_role='platform_admin'`. Others get the styled 404 (do not reveal the page exists). Every admin view/action writes `audit_log` (`actor_kind='admin'`).

### 2.5 Webhook hardening (`/api/telegram`)
- `setWebhook` with `secret_token = TELEGRAM_WEBHOOK_SECRET` and `allowed_updates=["message","callback_query","my_chat_member"]` via `scripts/set-webhook.ts`.
- Handler: reject (401, empty body) unless header `X-Telegram-Bot-Api-Secret-Token` equals the secret (constant-time). Insert `update_id` into `telegram_updates` with `on conflict do nothing`; if it already existed → 200 immediately (idempotent). Do quick work inline (< 2 s, e.g. answerCallbackQuery), enqueue anything slow as a job; always return 200 within 5 s.

### 2.6 Platform security
- Rate limits (Upstash `@upstash/ratelimit`): `/api/mini/*` 60 req/min/user; uploads 20/hour/user; AI-triggering actions 30/hour/project; login 10/min/IP. 429 body: `{ "error":"rate_limited", "message":"Too many requests. Please wait a minute and try again." }`.
- CSRF: for cookie-auth mutating routes, require `Origin` = `APP_URL` (or Telegram web origins for Mini App) and a double-submit token header `x-csrf-token`. Mini App routes using `Authorization: tma` are exempt.
- Security headers via `next.config` / middleware: CSP (default-src 'self'; script-src 'self' https://telegram.org; frame-ancestors https://web.telegram.org https://*.telegram.org 'self'; img-src 'self' data: blob: <supabase storage host>; connect-src 'self' <supabase> <rpc>), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`.
- Input validation: every route parses body/query with a Zod schema from `src/lib/validation`; unknown keys rejected (`.strict()`).
- Errors: never return stack traces; return `{error, message, requestId}` and log details with the requestId.
- Dependency audit: `pnpm audit --prod` has no high/critical (or each is documented with reason).

## Acceptance criteria
- [ ] `verifyInitData` unit tests: valid sample passes; tampered field fails; wrong bot token fails; `auth_date` 2 h old fails; future `auth_date` fails. (Generate test vectors in the test with a fake token — never the real one.)
- [ ] Login Widget verification has equivalent tests.
- [ ] RBAC matrix test covers every cell (generated from the table).
- [ ] Route-coverage test fails if any API route lacks auth (prove it by temporarily adding an unprotected route in the test fixture).
- [ ] Tenant isolation integration test: user who is contractor on project A gets 403 for every project-B endpoint and RLS returns 0 rows for B.
- [ ] Subcontractor cannot read unassigned stages or any documents (API + RLS).
- [ ] Contractor calling `POST /api/mini/fund` and `POST /api/mini/review` gets 403 (audit item).
- [ ] `curl -i https://<preview>/admin` while logged out returns the styled 404; admin login works for an allowlisted id.
- [ ] Webhook: wrong secret → 401; same `update_id` twice → handled once (test).
- [ ] Rate limit returns 429 with the exact message (test with a low limit in test env).
- [ ] Security headers present (curl output in DoD).

## Definition of Done — run these commands and paste output
```bash
pnpm typecheck && pnpm lint
pnpm test -- --reporter=verbose src/server/auth
pnpm test:integration -- tests/integration/auth tests/integration/tenancy tests/integration/webhook
pnpm build
pnpm audit --prod
# against local dev or the Vercel preview URL ($URL):
curl -s -o /dev/null -w "%{http_code}\n" $URL/admin
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/telegram -H "X-Telegram-Bot-Api-Secret-Token: wrong" -d '{}'
curl -s -X POST $URL/api/mini/fund -H 'content-type: application/json' -d '{}'
curl -sI $URL/ | grep -iE "content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy"
```
Then reply with this report, in this order:
1. **Inspection findings** (what you found that differed from this prompt).
2. **What changed** (files added/modified, migrations, env vars added).
3. **Acceptance criteria** — copy the checklist above, tick each box, and for each one give the evidence (test name, command output line, screenshot path).
4. **Command output** — paste the full output of every command below (trim only passing-test lists longer than 50 lines; never trim failures).
5. **Not done / risks** — anything incomplete, with the reason.
