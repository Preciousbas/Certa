# Migrations

Files live in `packages/db/migrations/`. Nothing in this document was checked against production. Fill in the last column yourself after you run the SQL at the bottom in the Supabase SQL editor.

Startup migrations run only when `CERTA_RUN_MIGRATIONS=1`. `CERTA_SKIP_MIGRATIONS=1` forces them off, including on Vercel and in the verify worker. Leave production on `CERTA_SKIP_MIGRATIONS=1`.

Apply SQL by hand:

- `pnpm db:migrate` runs `scripts/db-migrate.ts`. It needs `DATABASE_URL` and applies a prefix only when the matching table or column is missing. It does not apply `0001_init.sql`. Point it at a copy of the database, not at production, unless you mean to change production.
- Or paste one file at a time into the Supabase SQL editor, in the order below.

`scripts/db-migrate.ts` asks for prefix `0002`. There are two files with that prefix. `migrationNamed` returns the first name `readdir` lists. The check in the script is for `public.jobs`, which `0002_foundation.sql` creates. `0002_nonce_stage_and_fund_cleanup.sql` is included when a fresh database runs the full bundle (`migrationSql`), which sorts every file by name.

| File | What it does | Applied in production |
| --- | --- | --- |
| `0001_init.sql` | Creates the first tables: users, workspaces, projects, parties, stages, payments, documents, photos, and the rest of the original schema. | |
| `0002_foundation.sql` | Adds `workspaces.is_demo`, audit `reason` and `request_id`, `fx_rates`, and `jobs`. Marks workspaces demo when their project uses `terms_hash = 'seeded-terms'`. | |
| `0002_nonce_stage_and_fund_cleanup.sql` | Adds `capture_nonces.stage_id`. Deletes one hard-coded payment id from early local data. | |
| `0003_spec_schema.sql` | Widens `stages.status` to the spec list, and adds the spec tables that 0001 and 0002 did not create (including `contract_versions`). | |
| `0004_auth.sql` | Adds `users.platform_role`, audit actor columns, membership backfill, and the `is_member` helper used by row security. | |
| `0005_intake.sql` | Adds `projects.current_contract_version_id` and the document columns used by intake (`uploaded_by`, `file_name`, `mime_type`, and the rest). | |
| `0006_join_code_revoke.sql` | Adds `join_codes.revoked_at`. | |
| `0007_chain.sql` | Adds `projects.chain_sync`, extra `chain_txs` columns, and the wallet `purpose` check that includes `agent_x402` and `treasury`. | |
| `0008_verify.sql` | Adds photo verification columns, including `photos.stage_id`. | |
| `0009_bot_notify.sql` | Adds `memberships.notify_channel`, default `telegram`. | |
| `0010_notification_blocked.sql` | Allows `notifications.status` to be `blocked` as well as `queued`, `sent`, and `failed`. | |
| `0011_allowance_micro.sql` | Adds `workspaces.allowance_micro` and copies a non-zero `x402_allowance_usdc` into it when the new column is still 0. | |

## Which migrations are applied

Paste this into the Supabase SQL editor. It only reads.

```sql
-- Tracking table, if the Supabase CLI created one. The app does not write this table.
select 'schema_migrations' as source, version, name
from supabase_migrations.schema_migrations
order by version;

-- If that errors, the CLI history is absent. Use the column checks below.
select
  to_regclass('public.contract_versions') is not null as has_0003_contract_versions,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'file_name'
  ) as has_0005_documents_file_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'current_contract_version_id'
  ) as has_0005_current_contract_version_id,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'chain_sync'
  ) as has_0007_chain_sync,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'memberships' and column_name = 'notify_channel'
  ) as has_0009_notify_channel,
  exists (
    select 1 from pg_constraint
    where conname = 'notifications_status_check'
      and pg_get_constraintdef(oid) like '%blocked%'
  ) as has_0010_blocked_status,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspaces' and column_name = 'allowance_micro'
  ) as has_0011_allowance_micro;
```
