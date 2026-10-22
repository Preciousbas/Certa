CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  phone_ciphertext text,
  email_ciphertext text,
  locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  company text NOT NULL,
  plan text NOT NULL DEFAULT 'project',
  status text NOT NULL DEFAULT 'active',
  gas_allowance_usdc bigint NOT NULL DEFAULT 0,
  x402_allowance_usdc bigint NOT NULL DEFAULT 0,
  letterhead_file_id uuid,
  margin_top integer NOT NULL DEFAULT 96,
  margin_bottom integer NOT NULL DEFAULT 72,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'consultant', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  name text NOT NULL,
  site_location text NOT NULL,
  site_lat double precision NOT NULL,
  site_lng double precision NOT NULL,
  geofence_radius_m integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  fx_rate_locked bigint NOT NULL,
  fx_source text NOT NULL,
  fx_locked_at timestamptz,
  escrow_address text,
  spending_cap_usdc bigint NOT NULL,
  retention_bps integer NOT NULL,
  defects_period_days integer NOT NULL,
  dispute_timeout_days integer NOT NULL DEFAULT 7,
  change_reply_hours integer NOT NULL DEFAULT 72,
  deemed_acceptance boolean NOT NULL DEFAULT false,
  mobilisation_bps integer NOT NULL DEFAULT 0,
  contract_sum_kobo bigint NOT NULL,
  contract_sum_usdc bigint NOT NULL,
  terms_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('client', 'consultant', 'main_contractor', 'subcontractor')),
  wallet_address text,
  cdp_wallet_id text,
  wallet_mock boolean NOT NULL DEFAULT false,
  can_view_subs boolean NOT NULL DEFAULT false,
  notification_emails jsonb NOT NULL DEFAULT '[]',
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  role text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE join_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  stage_index integer NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_ngn_kobo bigint NOT NULL,
  amount_usdc bigint NOT NULL,
  retention_bps integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  funded boolean NOT NULL DEFAULT false,
  on_chain_idx integer NOT NULL,
  assigned_party_id uuid REFERENCES parties(id),
  pour boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage_index)
);

CREATE TABLE contract_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  version integer NOT NULL,
  json jsonb NOT NULL,
  hash text NOT NULL,
  accepted_by_client_at timestamptz,
  accepted_by_contractor_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  parsed_json jsonb,
  parse_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES stages(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  submitted_by uuid NOT NULL REFERENCES users(id),
  ai_assessment_json jsonb,
  confidence double precision,
  decision text,
  evidence_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES submissions(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  phash text NOT NULL,
  captured_at timestamptz,
  gps_lat double precision,
  gps_lng double precision,
  device text,
  checks_json jsonb NOT NULL,
  stamped_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX photos_sha256_unique ON photos (sha256);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  stage_id uuid REFERENCES stages(id),
  by_user_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL,
  reason text,
  at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES stages(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  raised_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  evidence jsonb,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  resolution jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  type text NOT NULL,
  before_json jsonb NOT NULL,
  after_json jsonb NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',
  response text,
  reason text,
  responded_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid REFERENCES stages(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  kind text NOT NULL,
  amount_usdc bigint NOT NULL,
  amount_ngn_kobo bigint NOT NULL,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL UNIQUE,
  certificate_doc_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE x402_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  endpoint text NOT NULL,
  cost_usdc bigint NOT NULL,
  tx_hash text,
  receipt jsonb,
  response_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid REFERENCES projects(id),
  to_ciphertext text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  actor_user_id uuid,
  actor_telegram_id bigint,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before_hash text,
  after_hash text,
  prev_hash text NOT NULL,
  row_hash text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid,
  kind text NOT NULL,
  amount_usdc bigint NOT NULL,
  period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_ngn_kobo bigint NOT NULL,
  interval text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE capture_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  user_id uuid NOT NULL REFERENCES users(id),
  stage_id uuid NOT NULL REFERENCES stages(id),
  nonce_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bot_sessions (
  telegram_id bigint PRIMARY KEY,
  active_project_id uuid REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blobs (
  storage_key text PRIMARY KEY,
  bytes text NOT NULL,
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, price_ngn_kobo, interval) VALUES
  ('project-month', 'Per active project, monthly', 15000000, 'month'),
  ('project-year', 'Per active project, yearly', 150000000, 'year');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'certa_app') THEN
    CREATE ROLE certa_app NOLOGIN;
  END IF;
END $$;

GRANT certa_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO certa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO certa_app;
REVOKE UPDATE, DELETE ON audit_log FROM certa_app;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages FORCE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON projects FOR SELECT TO certa_app
  USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR EXISTS (
      SELECT 1 FROM parties
      WHERE parties.project_id = projects.id
        AND parties.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY stages_select ON stages FOR SELECT TO certa_app
  USING (
    (
      workspace_id::text = current_setting('app.current_workspace_id', true)
      AND current_setting('app.current_workspace_role', true) IN ('owner', 'admin', 'consultant', 'viewer')
    )
    OR EXISTS (
      SELECT 1 FROM parties p
      WHERE p.project_id = stages.project_id
        AND p.user_id::text = current_setting('app.current_user_id', true)
        AND (
          p.role IN ('client', 'consultant')
          OR (p.role = 'main_contractor' AND p.can_view_subs)
          OR (p.role = 'subcontractor' AND stages.assigned_party_id = p.id)
        )
    )
  );

CREATE POLICY parties_select ON parties FOR SELECT TO certa_app
  USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY photos_select ON photos FOR SELECT TO certa_app
  USING (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    OR EXISTS (
      SELECT 1 FROM parties p
      WHERE p.project_id = photos.project_id
        AND p.user_id::text = current_setting('app.current_user_id', true)
        AND p.role <> 'subcontractor'
    )
    OR EXISTS (
      SELECT 1 FROM parties p
      JOIN stages s ON s.project_id = photos.project_id AND s.assigned_party_id = p.id
      WHERE p.user_id::text = current_setting('app.current_user_id', true)
        AND p.role = 'subcontractor'
    )
  );
