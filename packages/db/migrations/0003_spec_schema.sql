-- Tables, locks, and policies from docs/spec/02_DATA_AND_STATE.md that 0001 and 0002 did not create.
-- Existing tables that already hold rows are kept. See docs/spec/SCHEMA_DIFF.md.

UPDATE stages SET funded = true WHERE status = 'funded';
UPDATE stages SET status = 'not_started' WHERE status IN ('pending', 'funded');
ALTER TABLE stages ALTER COLUMN status SET DEFAULT 'not_started';
ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_status_check;
ALTER TABLE stages ADD CONSTRAINT stages_status_check CHECK (status IN (
  'not_started', 'in_progress', 'submitted', 'ai_review', 'ai_fail', 'needs_more_evidence',
  'awaiting_certification', 'awaiting_client_approval', 'approved', 'releasing', 'released',
  'release_failed', 'disputed', 'cancelled'
));

CREATE TABLE IF NOT EXISTS telegram_identities (
  telegram_user_id bigint PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  username text,
  first_name text,
  last_name text,
  photo_url text,
  language_code text,
  last_auth_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('client', 'consultant', 'contractor', 'subcontractor', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  invited_by uuid REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS memberships_user_active ON memberships (user_id) WHERE status = 'active';

INSERT INTO memberships (project_id, user_id, role)
SELECT project_id, user_id, CASE role WHEN 'main_contractor' THEN 'contractor' ELSE role END
FROM parties
WHERE role IN ('client', 'consultant', 'main_contractor', 'contractor', 'subcontractor', 'viewer')
ON CONFLICT (project_id, user_id, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  project_id uuid REFERENCES projects(id),
  purpose text NOT NULL CHECK (purpose IN ('client', 'consultant', 'contractor', 'subcontractor', 'operator', 'agent_x402')),
  provider text NOT NULL DEFAULT 'cdp',
  provider_account_ref text NOT NULL,
  address text NOT NULL CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  chain_id int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address, chain_id)
);
CREATE INDEX IF NOT EXISTS wallets_user_id ON wallets (user_id);
CREATE INDEX IF NOT EXISTS wallets_project_id ON wallets (project_id);

CREATE TABLE IF NOT EXISTS extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  document_ids uuid[] NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  model text NOT NULL,
  prompt_version text NOT NULL,
  raw_json jsonb NOT NULL DEFAULT '{}',
  validated_json jsonb,
  issues jsonb NOT NULL DEFAULT '[]',
  input_tokens int,
  output_tokens int,
  cost_micro bigint,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extractions_project_id ON extractions (project_id);

CREATE TABLE IF NOT EXISTS contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  version int NOT NULL,
  extraction_id uuid REFERENCES extractions(id),
  status text NOT NULL CHECK (status IN ('draft', 'pending_acceptance', 'accepted', 'superseded')),
  currency text NOT NULL DEFAULT 'NGN',
  contract_sum_kobo bigint NOT NULL CHECK (contract_sum_kobo > 0),
  vat_bps int NOT NULL DEFAULT 0,
  vat_kobo bigint NOT NULL DEFAULT 0,
  retention_bps int NOT NULL DEFAULT 0 CHECK (retention_bps BETWEEN 0 AND 1000),
  advance_kobo bigint NOT NULL DEFAULT 0,
  advance_recovery jsonb,
  ld_rate_kobo bigint,
  ld_period text CHECK (ld_period IN ('day', 'week')),
  ld_cap_bps int,
  start_date date,
  completion_date date,
  defects_period_days int NOT NULL DEFAULT 180,
  kobo_per_usdc bigint NOT NULL CHECK (kobo_per_usdc > 0),
  fx_source text NOT NULL,
  fx_as_of date NOT NULL,
  spending_cap_micro bigint NOT NULL CHECK (spending_cap_micro > 0),
  terms jsonb NOT NULL,
  document_hashes text[] NOT NULL,
  content_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS contract_versions_project_id ON contract_versions (project_id);
CREATE INDEX IF NOT EXISTS contract_versions_extraction_id ON contract_versions (extraction_id);
CREATE INDEX IF NOT EXISTS contract_versions_created_by ON contract_versions (created_by);

CREATE TABLE IF NOT EXISTS contract_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES contract_versions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('client', 'contractor')),
  decision text NOT NULL CHECK (decision IN ('accepted', 'change_requested')),
  reason text,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_version_id, role)
);
CREATE INDEX IF NOT EXISTS contract_acceptances_user_id ON contract_acceptances (user_id);

CREATE TABLE IF NOT EXISTS boq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES contract_versions(id),
  bill_ref text NOT NULL,
  item_ref text NOT NULL,
  description text NOT NULL,
  unit text,
  quantity_milli bigint,
  rate_kobo bigint,
  amount_kobo bigint NOT NULL,
  stated_amount_kobo bigint,
  source_anchor text NOT NULL,
  confidence real NOT NULL
);
CREATE INDEX IF NOT EXISTS boq_items_contract_version_id ON boq_items (contract_version_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  anchor text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text', 'table_row', 'cell', 'ocr_line')),
  content text NOT NULL,
  ocr_confidence real,
  ord int NOT NULL
);
CREATE INDEX IF NOT EXISTS document_chunks_document_id ON document_chunks (document_id);

CREATE TABLE IF NOT EXISTS escrows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id),
  contract_version_id uuid NOT NULL REFERENCES contract_versions(id),
  chain_id int NOT NULL,
  factory_address text NOT NULL,
  address text NOT NULL,
  create_tx_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_txs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  stage_id uuid REFERENCES stages(id),
  kind text NOT NULL CHECK (kind IN (
    'create_escrow', 'accept_terms', 'approve_usdc', 'fund', 'submit_stage', 'client_approve',
    'release_stage', 'dispute', 'resolve_dispute', 'add_variation', 'release_retention', 'refund',
    'x402_payment', 'gas_topup'
  )),
  idempotency_key text NOT NULL UNIQUE,
  chain_id int NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  calldata text,
  value_micro bigint,
  status text NOT NULL CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed', 'replaced')),
  tx_hash text UNIQUE,
  block_number bigint,
  confirmations int NOT NULL DEFAULT 0,
  error text,
  attempts int NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chain_txs_project_id ON chain_txs (project_id);
CREATE INDEX IF NOT EXISTS chain_txs_stage_id ON chain_txs (stage_id);
CREATE INDEX IF NOT EXISTS chain_txs_open ON chain_txs (status) WHERE status IN ('pending', 'submitted');

CREATE TABLE IF NOT EXISTS x402_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  stage_id uuid REFERENCES stages(id),
  endpoint text NOT NULL,
  amount_micro bigint NOT NULL,
  chain_tx_id uuid REFERENCES chain_txs(id),
  payment_response jsonb NOT NULL,
  result_summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS x402_spend_project_id ON x402_spend (project_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  payload jsonb NOT NULL,
  channel text NOT NULL DEFAULT 'telegram',
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  telegram_message_id bigint,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_queued ON notifications (status) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id bigint PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

CREATE TABLE IF NOT EXISTS variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  proposed_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('add', 'omit', 'alter')),
  amount_kobo bigint NOT NULL,
  affects_stage_id uuid REFERENCES stages(id),
  status text NOT NULL CHECK (status IN ('proposed', 'accepted', 'declined', 'expired', 'applied')),
  responded_by uuid REFERENCES users(id),
  response_reason text,
  respond_by timestamptz NOT NULL,
  applied_tx_id uuid REFERENCES chain_txs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS variations_project_status ON variations (project_id, status);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id);

CREATE INDEX IF NOT EXISTS stages_project_status ON stages (project_id, status);
CREATE INDEX IF NOT EXISTS documents_project_id ON documents (project_id);

CREATE OR REPLACE FUNCTION contract_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.extraction_id IS DISTINCT FROM OLD.extraction_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.contract_sum_kobo IS DISTINCT FROM OLD.contract_sum_kobo
     OR NEW.vat_bps IS DISTINCT FROM OLD.vat_bps
     OR NEW.vat_kobo IS DISTINCT FROM OLD.vat_kobo
     OR NEW.retention_bps IS DISTINCT FROM OLD.retention_bps
     OR NEW.advance_kobo IS DISTINCT FROM OLD.advance_kobo
     OR NEW.advance_recovery IS DISTINCT FROM OLD.advance_recovery
     OR NEW.ld_rate_kobo IS DISTINCT FROM OLD.ld_rate_kobo
     OR NEW.ld_period IS DISTINCT FROM OLD.ld_period
     OR NEW.ld_cap_bps IS DISTINCT FROM OLD.ld_cap_bps
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.completion_date IS DISTINCT FROM OLD.completion_date
     OR NEW.defects_period_days IS DISTINCT FROM OLD.defects_period_days
     OR NEW.kobo_per_usdc IS DISTINCT FROM OLD.kobo_per_usdc
     OR NEW.fx_source IS DISTINCT FROM OLD.fx_source
     OR NEW.fx_as_of IS DISTINCT FROM OLD.fx_as_of
     OR NEW.spending_cap_micro IS DISTINCT FROM OLD.spending_cap_micro
     OR NEW.terms IS DISTINCT FROM OLD.terms
     OR NEW.document_hashes IS DISTINCT FROM OLD.document_hashes
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'contract version content is locked';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending_acceptance' AND NEW.status IN ('accepted', 'draft'))
    OR (OLD.status = 'accepted' AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'contract version status cannot move from % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_versions_immutable_trg ON contract_versions;
CREATE TRIGGER contract_versions_immutable_trg
  BEFORE UPDATE ON contract_versions
  FOR EACH ROW EXECUTE FUNCTION contract_versions_immutable();

CREATE OR REPLACE FUNCTION contract_summaries_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.accepted_by_client_at IS NOT NULL AND OLD.accepted_by_contractor_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract version is locked after both parties accept';
  END IF;
  IF OLD.accepted_by_client_at IS NOT NULL OR OLD.accepted_by_contractor_at IS NOT NULL THEN
    IF NEW.json IS DISTINCT FROM OLD.json
       OR NEW.hash IS DISTINCT FROM OLD.hash
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    THEN
      RAISE EXCEPTION 'contract version content is locked after one party accepts';
    END IF;
    IF OLD.accepted_by_client_at IS NOT NULL AND NEW.accepted_by_client_at IS DISTINCT FROM OLD.accepted_by_client_at THEN
      RAISE EXCEPTION 'client acceptance is already recorded';
    END IF;
    IF OLD.accepted_by_contractor_at IS NOT NULL AND NEW.accepted_by_contractor_at IS DISTINCT FROM OLD.accepted_by_contractor_at THEN
      RAISE EXCEPTION 'contractor acceptance is already recorded';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_summaries_lock_trg ON contract_summaries;
CREATE TRIGGER contract_summaries_lock_trg
  BEFORE UPDATE ON contract_summaries
  FOR EACH ROW EXECUTE FUNCTION contract_summaries_lock();

CREATE OR REPLACE FUNCTION is_member(p uuid, roles text[] DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.project_id = p
      AND m.user_id::text = coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        current_setting('app.current_user_id', true)
      )
      AND m.status = 'active'
      AND (roles IS NULL OR m.role = ANY (roles))
  );
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS contract_versions_select ON contract_versions;
CREATE POLICY contract_versions_select ON contract_versions FOR SELECT TO certa_app
  USING (is_member(project_id));
DROP POLICY IF EXISTS stages_member_select ON stages;
CREATE POLICY stages_member_select ON stages FOR SELECT TO certa_app
  USING (is_member(project_id));
DROP POLICY IF EXISTS audit_member_select ON audit_log;
CREATE POLICY audit_member_select ON audit_log FOR SELECT TO certa_app
  USING (project_id IS NOT NULL AND is_member(project_id, ARRAY['client', 'consultant']));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('documents', 'documents', false), ('photos', 'photos', false), ('certificates', 'certificates', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO certa_app;
REVOKE UPDATE, DELETE ON audit_log FROM certa_app;
REVOKE UPDATE, DELETE ON contract_versions FROM certa_app;
