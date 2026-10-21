# 02 — Data model, money rules, state machine, audit log

Cursor: reference file. Prompt 10 implements it. **Before creating tables, inspect the existing Supabase schema** (`supabase/migrations`, Prisma/Drizzle schema, or `select table_name from information_schema.tables where table_schema='public'`) and write `docs/spec/SCHEMA_DIFF.md`: existing table → target table, keep/rename/migrate/drop, with row counts. Migrate existing real data; do not drop anything containing real data without listing it in SCHEMA_DIFF.md first.

Conventions: Postgres 15 (Supabase). Migrations are SQL files in `supabase/migrations/` (if the repo already uses Drizzle or Prisma, keep that tool and generate equivalent SQL — report which). `id uuid primary key default gen_random_uuid()`. `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` with trigger. All timestamps UTC in DB; displayed in WAT. snake_case. Every FK has an index. Soft delete only where stated (`deleted_at`).

Shorthand used below (expand it in real SQL): `id uuid pk` = `id uuid primary key default gen_random_uuid()`; a bare `created_at` / `updated_at` = the standard columns above. Tables are listed by topic, not creation order — order the migration so referenced tables exist first (users → workspaces → projects → …) or add FKs with `alter table` at the end.

## 1. Money rules (non-negotiable)
- Naira amounts: `bigint` **kobo** (₦1 = 100 kobo). Column suffix `_kobo`.
- USDC amounts: `bigint` **micro-USDC** (1 USDC = 1,000,000; USDC has 6 decimals). Suffix `_micro`. Use `numeric(78,0)` only for raw on-chain uint256 values that might exceed bigint (`_raw`).
- FX rate: stored as `kobo_per_usdc bigint` (₦1,331.11 per USDC → `133111`), plus `source text`, `as_of date`. One active rate per project contract version, frozen at acceptance. Display rate everywhere from that row.
- Conversions: `micro = floor(kobo * 1_000_000 / kobo_per_usdc)`; for a list of stages use **largest-remainder allocation** so stage USDC amounts sum exactly to `floor(total_kobo*1e6/rate)`. Worked example in 30 §5.
- Percentages: basis points `int` (5% = 500).
- In TypeScript use `bigint` only (or a `Money` class wrapping bigint). `number` is banned for money; an ESLint rule (prompt 10) enforces it on files under `src/lib/money` and any `*Kobo`/`*Micro` identifiers. JSON transport: strings (`"5525500000"`).
- Rounding: VAT/retention/percent of money → round half up to the kobo, then reconcile any residual into the last stage, and record it as a `rounding_adjustment` issue (info level) if non-zero.

## 2. Tables

### Tenancy and identity
```sql
create table workspaces (
  id uuid pk, name text not null check (length(name) between 2 and 120),
  owner_user_id uuid not null references users(id),
  plan text not null default 'trial' check (plan in ('trial','monthly','yearly','paused','cancelled')),
  is_demo boolean not null default false,            -- demo data lives ONLY in is_demo workspaces
  allowance_micro bigint not null default 0 check (allowance_micro >= 0), -- monthly gas+x402 allowance
  created_at, updated_at);
create table users (
  id uuid pk, display_name text not null, email citext unique null, phone text null,
  platform_role text not null default 'user' check (platform_role in ('user','platform_admin')),
  created_at, updated_at);
create table telegram_identities (
  telegram_user_id bigint primary key, user_id uuid not null unique references users(id),
  username text null, first_name text, last_name text, photo_url text, language_code text,
  last_auth_at timestamptz not null);
create table memberships (
  id uuid pk, project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id),
  role text not null check (role in ('client','consultant','contractor','subcontractor','viewer')),
  status text not null default 'active' check (status in ('active','removed')),
  invited_by uuid references users(id), joined_at timestamptz not null default now(),
  unique (project_id, user_id, role));
create index on memberships(user_id) where status='active';
create table join_codes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  project_id uuid not null references projects(id), role text not null,
  created_by uuid not null references users(id), expires_at timestamptz not null,
  used_by uuid null references users(id), used_at timestamptz null);
create table wallets (
  id uuid pk, user_id uuid null references users(id), project_id uuid null references projects(id),
  purpose text not null check (purpose in ('client','consultant','contractor','subcontractor','operator','agent_x402')),
  provider text not null default 'cdp', provider_account_ref text not null,   -- CDP account name/id, never a private key
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'), chain_id int not null,
  created_at, unique(address, chain_id));
```
### Projects, documents, contract versions
```sql
create table projects (
  id uuid pk, workspace_id uuid not null references workspaces(id),
  name text not null, location_text text not null,
  site_lat double precision null, site_lng double precision null,   -- coordinates are not money; float allowed
  site_radius_m int not null default 150 check (site_radius_m between 25 and 2000),
  status text not null default 'draft' check (status in ('draft','awaiting_acceptance','active','paused','completed','closed')),
  dispute_decision_days int not null default 7 check (dispute_decision_days between 1 and 60),
  reply_window_hours int not null default 72,
  timezone text not null default 'Africa/Lagos',
  current_contract_version_id uuid null, escrow_id uuid null,
  created_at, updated_at);
create table documents (
  id uuid pk, project_id uuid not null references projects(id),
  uploaded_by uuid not null references users(id),
  file_name text not null, mime_type text not null, detected_type text not null
    check (detected_type in ('pdf_text','pdf_scanned','docx','xlsx','xls','csv','image')),
  size_bytes int not null check (size_bytes between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'), storage_key text not null,
  page_count int null, sheet_names text[] null,
  status text not null default 'uploaded' check (status in ('uploaded','parsing','parsed','failed','removed')),
  failure_code text null, created_at, unique(project_id, sha256));
create table document_chunks (            -- parsed content with citation anchors
  id uuid pk, document_id uuid not null references documents(id) on delete cascade,
  anchor text not null,                    -- 'p4' | 'BoQ!F27' | 'p4:table2:r7'
  kind text not null check (kind in ('text','table_row','cell','ocr_line')),
  content text not null, ocr_confidence real null, ord int not null);
create table extractions (
  id uuid pk, project_id uuid not null references projects(id),
  document_ids uuid[] not null, status text not null check (status in ('queued','running','succeeded','failed')),
  model text not null, prompt_version text not null, raw_json jsonb not null default '{}',
  validated_json jsonb null, issues jsonb not null default '[]', input_tokens int, output_tokens int,
  cost_micro bigint, started_at timestamptz, finished_at timestamptz, created_at);
create table contract_versions (
  id uuid pk, project_id uuid not null references projects(id), version int not null,
  extraction_id uuid null references extractions(id),
  status text not null check (status in ('draft','pending_acceptance','accepted','superseded')),
  currency text not null default 'NGN',
  contract_sum_kobo bigint not null check (contract_sum_kobo > 0),
  vat_bps int not null default 0, vat_kobo bigint not null default 0,
  retention_bps int not null default 0 check (retention_bps between 0 and 1000),
  advance_kobo bigint not null default 0, advance_recovery jsonb null,
  ld_rate_kobo bigint null, ld_period text null check (ld_period in ('day','week')), ld_cap_bps int null,
  start_date date null, completion_date date null, defects_period_days int not null default 180,
  kobo_per_usdc bigint not null check (kobo_per_usdc > 0), fx_source text not null, fx_as_of date not null,
  spending_cap_micro bigint not null check (spending_cap_micro > 0),
  terms jsonb not null,          -- parties, payment period, fluctuation, variation procedure, citations
  document_hashes text[] not null,
  content_hash text not null,    -- sha256 of canonical JSON of this version (what both parties accepted)
  created_by uuid not null references users(id), created_at,
  unique(project_id, version));
-- immutability: trigger rejects UPDATE of any column except status ('pending_acceptance'->'accepted'|'draft', 'accepted'->'superseded') 
create table contract_acceptances (
  id uuid pk, contract_version_id uuid not null references contract_versions(id),
  user_id uuid not null references users(id), role text not null check (role in ('client','contractor')),
  decision text not null check (decision in ('accepted','change_requested')), reason text null,
  content_hash text not null, created_at, unique(contract_version_id, role));
create table boq_items (
  id uuid pk, contract_version_id uuid not null references contract_versions(id),
  bill_ref text not null, item_ref text not null, description text not null, unit text null,
  quantity_milli bigint null,              -- quantity ×1000 (48.6 m3 → 48600)
  rate_kobo bigint null, amount_kobo bigint not null, stated_amount_kobo bigint null,
  source_anchor text not null, confidence real not null);
create table stages (
  id uuid pk, project_id uuid not null references projects(id),
  contract_version_id uuid not null references contract_versions(id),
  number int not null check (number >= 1), name text not null,
  kind text not null default 'work' check (kind in ('work','mobilisation','reserve','variation')),
  amount_kobo bigint not null check (amount_kobo >= 0), amount_micro bigint not null check (amount_micro >= 0),
  acceptance_criteria jsonb not null,      -- [{id:'c1', text:'...', required:true}]
  tags text[] not null default '{}',       -- e.g. {'concrete_pour'}
  assigned_user_id uuid null references users(id),
  status text not null default 'not_started',  -- see §4
  onchain_index int null, created_at, updated_at, unique(project_id, number));
```
### Evidence, verdicts, decisions
```sql
create table capture_nonces (nonce text pk, user_id uuid not null, stage_id uuid not null, expires_at timestamptz not null, used_at timestamptz null);
create table photos (
  id uuid pk, stage_id uuid not null references stages(id), submission_id uuid not null references submissions(id),
  uploaded_by uuid not null references users(id), storage_key text not null, sha256 text not null,
  captured_at timestamptz not null, received_at timestamptz not null default now(),
  lat double precision not null, lng double precision not null, accuracy_m real not null,
  distance_from_site_m real not null, exif jsonb not null default '{}', nonce text not null,
  checks jsonb not null);                   -- {fresh:true, in_radius:true, nonce_ok:true, exif_present:false}
create table submissions (
  id uuid pk, stage_id uuid not null references stages(id), submitted_by uuid not null references users(id),
  evidence_hash text not null,              -- sha256 of sorted photo hashes + stage id (bytes32 on-chain)
  status text not null check (status in ('received','verifying','verified','rejected_checks')), created_at);
create table ai_verdicts (
  id uuid pk, submission_id uuid not null references submissions(id), stage_id uuid not null,
  model text not null, prompt_version text not null, verdict text not null check (verdict in ('pass','fail','unsure')),
  confidence real not null check (confidence between 0 and 1), raw_json jsonb not null,
  criteria_results jsonb not null, reasons text[] not null, issues text[] not null,
  safety_flags text[] not null default '{}', latency_ms int, cost_micro bigint, created_at);
create table approvals (
  id uuid pk, stage_id uuid not null references stages(id), user_id uuid not null references users(id),
  role text not null check (role in ('consultant','client')),
  decision text not null check (decision in ('certified','rejected','approved_release','declined_release')),
  reason text null check (decision in ('certified','approved_release') or length(reason) >= 10),
  channel text not null check (channel in ('telegram','web','mini_app')), created_at);
create table disputes (id uuid pk, stage_id uuid not null, opened_by uuid not null, reason text not null, evidence jsonb not null default '[]',
  status text not null check (status in ('open','settled','consultant_decided','withdrawn')), decision text null check (decision in ('release','refund','partial')),
  decided_by uuid null, decision_reason text null, decide_after timestamptz not null, created_at, resolved_at timestamptz null);
create table variations (id uuid pk, project_id uuid not null, proposed_by uuid not null, title text not null, description text not null,
  type text not null check (type in ('add','omit','alter')), amount_kobo bigint not null, affects_stage_id uuid null,
  status text not null check (status in ('proposed','accepted','declined','expired','applied')),
  responded_by uuid null, response_reason text null, respond_by timestamptz not null, applied_tx_id uuid null, created_at);
```
### Chain, fees, notifications, audit
```sql
create table escrows (id uuid pk, project_id uuid not null unique, contract_version_id uuid not null, chain_id int not null,
  factory_address text not null, address text not null, create_tx_id uuid not null, created_at);
create table chain_txs (
  id uuid pk, project_id uuid null, stage_id uuid null,
  kind text not null check (kind in ('create_escrow','accept_terms','approve_usdc','fund','submit_stage','client_approve','release_stage','dispute','resolve_dispute','add_variation','release_retention','refund','x402_payment','gas_topup')),
  idempotency_key text not null unique,     -- e.g. 'release_stage:<stage_id>:<approval_id>'
  chain_id int not null, from_address text not null, to_address text not null, calldata text null,
  value_micro bigint null, status text not null check (status in ('pending','submitted','confirmed','failed','replaced')),
  tx_hash text null unique, block_number bigint null, confirmations int not null default 0,
  error text null, attempts int not null default 0, submitted_at timestamptz, confirmed_at timestamptz, created_at);
create table x402_spend (id uuid pk, project_id uuid not null, stage_id uuid null, endpoint text not null, amount_micro bigint not null,
  chain_tx_id uuid null, payment_response jsonb not null, result_summary text not null, created_at);
create table notifications (id uuid pk, user_id uuid not null, kind text not null, payload jsonb not null,
  channel text not null default 'telegram', status text not null check (status in ('queued','sent','failed')),
  telegram_message_id bigint null, dedupe_key text not null unique, created_at, sent_at timestamptz);
create table telegram_updates (update_id bigint primary key, received_at timestamptz not null default now(), processed_at timestamptz null, error text null);
create table jobs (id bigint generated always as identity primary key, kind text not null, payload jsonb not null,
  dedupe_key text not null unique, status text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead')),
  attempts int not null default 0, run_after timestamptz not null default now(), last_error text null, created_at, updated_at);  -- outbox; drained by the queue worker (prompt 10)
create table fx_rates (id uuid pk, kobo_per_usdc bigint not null, source text not null, as_of date not null, created_at, unique(source, as_of));
create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  workspace_id uuid null, project_id uuid null, actor_user_id uuid null,
  actor_kind text not null check (actor_kind in ('user','agent','system','admin')),
  action text not null,                     -- 'stage.transition', 'contract.accepted', 'tx.confirmed', ...
  entity text not null, entity_id text not null,
  before jsonb null, after jsonb null, reason text null, request_id text null,
  prev_hash text null, row_hash text not null);  -- hash chain: sha256(prev_hash || canonical row)
-- REVOKE UPDATE, DELETE on audit_log from every role incl. service_role; trigger raises on UPDATE/DELETE.
create index on audit_log(project_id, occurred_at desc);
```
Other indexes (minimum): `stages(project_id,status)`, `photos(stage_id)`, `ai_verdicts(stage_id, created_at desc)`, `chain_txs(status) where status in ('pending','submitted')`, `notifications(status) where status='queued'`, `documents(project_id)`, `variations(project_id,status)`, `disputes(stage_id) where status='open'`.

## 3. Row Level Security (Supabase)
Enable RLS on **every** table. The server uses the service role only inside service functions; browser clients never get the service key. If the app uses Supabase auth JWTs minted after Telegram verification, claims are `sub` = users.id. Helper:
```sql
create function is_member(p uuid, roles text[] default null) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.project_id=p and m.user_id=auth.uid() and m.status='active'
    and (roles is null or m.role = any(roles))) $$;
```
Policies:
- `projects`: select if `is_member(id)`; insert via service only; update if `is_member(id, '{client}')` (only name/location/settings columns, enforced by a column-limited RPC).
- `stages`, `photos`, `submissions`, `ai_verdicts`, `approvals`, `disputes`, `variations`, `chain_txs`, `contract_versions`, `boq_items`, `documents`: select if `is_member(project_id)`, **plus** for role `subcontractor`: only rows whose stage `assigned_user_id = auth.uid()` (and documents: none). Writes only through server routes (service role) after RBAC checks.
- `memberships`: select own rows and rows of projects where you are client or consultant.
- `wallets`: select only own (`user_id = auth.uid()`).
- `audit_log`: select if `is_member(project_id, '{client,consultant}')`; no insert/update/delete for any client role.
- Storage buckets `documents`, `photos`, `certificates`: private. Access only through signed URLs (5 min) issued by the server after RBAC.
Tests (prompt 20) must prove: contractor of project A cannot read project B; subcontractor cannot read unassigned stages or documents; nobody can update audit_log.

## 4. Stage state machine (single source: `src/server/stages/transition.ts`)
States: `not_started`, `in_progress`, `submitted`, `ai_review`, `ai_fail`, `needs_more_evidence`, `awaiting_certification`, `awaiting_client_approval`, `approved`, `releasing`, `released`, `release_failed`, `disputed`, `cancelled`. Funding is a separate flag (`funded` derived from chain: stage index ≤ funded-up-to). Retention is tracked per escrow, not as a stage state.

| From | To | Trigger / who | Guard | Side effects |
|---|---|---|---|---|
| not_started | in_progress | contractor/sub (assigned) taps "Start" or first photo | contract accepted, stage funded | audit |
| in_progress, ai_fail, needs_more_evidence | submitted | contractor/sub (assigned) | ≥3 photos all passing capture checks | create submission |
| submitted | ai_review | system | — | enqueue AI job |
| ai_review | ai_fail | agent | verdict=fail | notify contractor (reasons) |
| ai_review | needs_more_evidence | agent | verdict=unsure OR confidence < 0.75 OR any required criterion unmet-but-not-visible | notify contractor + consultant |
| ai_review | awaiting_certification | agent | verdict=pass AND confidence ≥ 0.75 AND all required criteria met AND no safety flag | `submitStage(evidenceHash)` tx; notify consultant |
| awaiting_certification | awaiting_client_approval | consultant certifies | — | notify client |
| awaiting_certification | in_progress | consultant rejects | reason ≥10 chars | notify contractor |
| awaiting_client_approval | approved | client approves | if amount_micro > cap: clientApprove tx/sig recorded | — |
| awaiting_client_approval | in_progress | client declines | reason ≥10 chars | notify contractor + consultant |
| approved | releasing | system | idempotency key free | release tx submitted |
| releasing | released | system (tx confirmed ≥ N confirmations) | receipt status=1, event StageReleased matches | notify all with link; fee record |
| releasing | release_failed | system | tx reverted/expired after retries | alert admin; notify client |
| release_failed | releasing | admin "Retry job" or system retry | same idempotency key | — |
| any of in_progress…awaiting_client_approval | disputed | client or contractor | reason ≥10 chars | `dispute` tx; lock |
| disputed | in_progress / approved | settled (both) or consultant decision after decide_after | — | `resolveDispute` tx |
| not_started | cancelled | both parties via accepted variation (omit) | not funded or refund path | — |

Implementation: `transition(stageId, to, {actor, reason, meta})` runs in one DB transaction with `select … for update`, checks the table above (encoded as data, unit-tested exhaustively: every pair not in the table must throw `IllegalTransition`), checks actor role via memberships, writes `audit_log` (`action='stage.transition'`, before/after), then enqueues side effects (outbox pattern: `jobs` rows committed in the same transaction).

## 5. Audit log
Every state change, money action, acceptance, approval, upload, AI verdict, admin action, login of admin, and settings change writes one row. `row_hash = sha256(prev_hash || canonical_json(row without row_hash))`, computed in a BEFORE INSERT trigger using a per-project advisory lock. `scripts/verify-audit-chain.ts` recomputes and reports breaks. Admin UI shows it read-only.

## 6. Chain is truth for money
DB stage money status is a cache. A reconciliation job (every 10 min + after each confirmed tx) reads the escrow (`stage(i)`, balances, events) and compares; mismatch → `reconciliation_mismatch` alert and the UI shows the chain value with a banner "Updating from the blockchain". Tiles on S9 come from reconciled values.
