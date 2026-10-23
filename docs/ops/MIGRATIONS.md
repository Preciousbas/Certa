# Migrations

Files live in `packages/db/migrations/`. The last column records a read-only check in the Supabase SQL editor on 23 Oct 2026. The query at the bottom is that check.

Startup migrations run only when `CERTA_RUN_MIGRATIONS=1`. `CERTA_SKIP_MIGRATIONS=1` forces them off, including on Vercel and in the verify worker. Leave production on `CERTA_SKIP_MIGRATIONS=1`.

Apply SQL by hand:

- `pnpm db:migrate` runs `scripts/db-migrate.ts`. It needs `DATABASE_URL` and applies a prefix only when the matching table or column is missing. It does not apply `0001_init.sql`. Point it at a copy of the database, not at production, unless you mean to change production.
- Or paste one file at a time into the Supabase SQL editor, in the order below.

`scripts/db-migrate.ts` asks for prefix `0002`. There are two files with that prefix. `migrationNamed` returns the first name `readdir` lists. The check in the script is for `public.jobs`, which `0002_foundation.sql` creates. `0002_nonce_stage_and_fund_cleanup.sql` is included when a fresh database runs the full bundle (`migrationSql`), which sorts every file by name.

| File | What it does | Applied in production |
| --- | --- | --- |
| `0001_init.sql` | Creates the first tables: users, workspaces, projects, parties, stages, payments, documents, photos, and the rest of the original schema. | Yes (its tables exist) |
| `0002_foundation.sql` | Adds `workspaces.is_demo`, audit `reason` and `request_id`, `fx_rates`, and `jobs`. Marks workspaces demo when their project uses `terms_hash = 'seeded-terms'`. | Yes (checked 23 Oct 2026) |
| `0002_nonce_stage_and_fund_cleanup.sql` | Adds `capture_nonces.stage_id`. Deletes one hard-coded payment id from early local data. | Yes (checked 23 Oct 2026) |
| `0003_spec_schema.sql` | Widens `stages.status` to the spec list, and adds the spec tables that 0001 and 0002 did not create (including `contract_versions`). | Yes (checked 23 Oct 2026) |
| `0004_auth.sql` | Adds `users.platform_role`, audit actor columns, membership backfill, and the `is_member` helper used by row security. | Yes (checked 23 Oct 2026) |
| `0005_intake.sql` | Adds `projects.current_contract_version_id` and the document columns used by intake (`uploaded_by`, `file_name`, `mime_type`, and the rest). | Yes (checked 23 Oct 2026) |
| `0006_join_code_revoke.sql` | Adds `join_codes.revoked_at`. | Yes (checked 23 Oct 2026) |
| `0007_chain.sql` | Adds `projects.chain_sync`, extra `chain_txs` columns, and the wallet `purpose` check that includes `agent_x402` and `treasury`. | Yes (checked 23 Oct 2026) |
| `0008_verify.sql` | Adds photo verification columns, including `photos.stage_id`. | Yes (checked 23 Oct 2026) |
| `0009_bot_notify.sql` | Adds `memberships.notify_channel`, default `telegram`. | Yes (checked 23 Oct 2026) |
| `0010_notification_blocked.sql` | Allows `notifications.status` to be `blocked` as well as `queued`, `sent`, and `failed`. | Yes (checked 23 Oct 2026) |
| `0011_allowance_micro.sql` | Adds `workspaces.allowance_micro` and copies a non-zero `x402_allowance_usdc` into it when the new column is still 0. | Yes (checked 23 Oct 2026) |

## Which migrations are applied

Paste this into the Supabase SQL editor. It only reads.

The 23 Oct 2026 check returned true for all 13 columns.

```sql
select
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='is_demo') as m0002_foundation,
  to_regclass('public.jobs') is not null as m0002_jobs,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='capture_nonces' and column_name='stage_id') as m0002_nonce_stage,
  to_regclass('public.contract_versions') is not null as m0003_spec,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='platform_role') as m0004_auth,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='file_name') as m0005_docs,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='current_contract_version_id') as m0005_contract_ver,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='join_codes' and column_name='revoked_at') as m0006_revoke,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='chain_sync') as m0007_chain,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='photos' and column_name='stage_id') as m0008_verify,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='memberships' and column_name='notify_channel') as m0009_notify,
  exists (select 1 from pg_constraint where conname='notifications_status_check' and pg_get_constraintdef(oid) like '%blocked%') as m0010_blocked,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='allowance_micro') as m0011_allowance;
```
