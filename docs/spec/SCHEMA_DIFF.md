# Schema diff

Compared `docs/spec/02_DATA_AND_STATE.md` with the database after `0001_init.sql` and `0002_foundation.sql`. `0003_spec_schema.sql` is the new migration. `0002` was not edited.

## Kept as they are

These tables already exist and may hold rows. Their primary keys stay `uuid`. `02` asks for `bigint identity` on `jobs` and `audit_log`. Changing that type would rewrite live rows, so the keys stay.

| Spec name                                | Live table        | Difference that stays                                                                                                                  |
| ---------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| users                                    | `users`           | `display_name` and `citext` email stay. Telegram id lives on `telegram_identities` and `bot_sessions`.                                 |
| workspaces                               | `workspaces`      | One `allowance_micro` column stays. `is_demo` stays.                                                                                   |
| projects                                 | `projects`        | Existing money and site columns stay.                                                                                                  |
| documents                                | `documents`       | Existing columns stay. Chunks hang off `documents.id`.                                                                                 |
| stages                                   | `stages`          | `amount_usdc` is the micro-USDC column. `funded` stays a boolean. Status values were remapped.                                         |
| submissions, photos, approvals, disputes | same names        | Existing columns stay.                                                                                                                 |
| jobs                                     | `jobs`            | `uuid` id and `run_at` stay. The worker writes `succeeded`, which `02` names.                                                          |
| fx_rates                                 | `fx_rates`        | `uuid` id stays.                                                                                                                       |
| audit_log                                | `audit_log`       | `uuid` id stays. `project_id` was added and is nullable because older rows have no project. The append-only triggers from `0002` stay. |
| capture_nonces                           | `capture_nonces`  | Unchanged.                                                                                                                             |
| parties, workspace_members               | same names        | Kept beside the new `memberships` table.                                                                                               |
| x402_calls                               | `x402_calls`      | Kept. `x402_spend` is the new table from `02`.                                                                                         |
| change_requests                          | `change_requests` | Kept. `variations` is the new table from `02`.                                                                                         |
| blobs                                    | `blobs`           | Not in `02`. Kept because contract uploads stored bytes here. `src/server/storage.ts` no longer writes it.                             |

## Added in 0003

`telegram_identities`, `memberships`, `wallets`, `extractions`, `contract_versions`, `contract_acceptances`, `boq_items`, `document_chunks`, `escrows`, `chain_txs`, `x402_spend`, `notifications`, `telegram_updates`, `variations`.

`memberships` is filled from `parties` (`main_contractor` becomes `contractor`).

Stage statuses `pending` and `funded` become `not_started`, and a row that was `funded` keeps `funded = true`. The check constraint is the fourteen product states. The default is `not_started`.

## Locks

`contract_versions` rejects an update of any column except `status`, and `status` only along `pending_acceptance → accepted|draft` and `accepted → superseded`.

`contract_summaries` rejects content changes once either acceptance timestamp is set, and rejects every update once both are set. That is the version both parties accepted.

## Access

`is_member(project_id, roles)` reads `memberships` for `request.jwt.claim.sub` or `app.current_user_id`. Policies on `contract_versions`, `stages`, and `audit_log` are for `certa_app`. Row level security is enabled on every public table. The table owner still bypasses policies. The audit triggers do not.

`UPDATE` and `DELETE` on `audit_log` are revoked from `certa_app`. The same revoke applies to `contract_versions`. The service connection is the table owner, so a status move still runs, and the trigger decides if it is legal.

## Storage

When the `storage` schema exists, `0003` inserts private buckets `documents`, `photos`, and `certificates`. `02` does not name a letterheads bucket.

## Indexes

`stages (project_id, status)`, `documents (project_id)`, `memberships (user_id) where status = active`, `chain_txs (status) where pending or submitted`, `notifications (status) where queued`, `variations (project_id, status)`, plus an index on each new foreign key.
