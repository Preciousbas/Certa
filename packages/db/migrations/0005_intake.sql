-- Intake columns. Older contract uploads keep kind, parse_status and storage_key.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'awaiting_acceptance', 'active', 'paused', 'completed', 'closed'));

ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_contract_version_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_current_contract_version_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_current_contract_version_id_fkey
      FOREIGN KEY (current_contract_version_id) REFERENCES contract_versions(id);
  END IF;
END $$;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS detected_type text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS size_bytes integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sheet_names text[];
ALTER TABLE documents ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'uploaded';

CREATE UNIQUE INDEX IF NOT EXISTS documents_project_sha256 ON documents (project_id, sha256);

ALTER TABLE stages ADD COLUMN IF NOT EXISTS contract_version_id uuid;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'work';
ALTER TABLE stages ADD COLUMN IF NOT EXISTS acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stages_contract_version_id_fkey'
  ) THEN
    ALTER TABLE stages
      ADD CONSTRAINT stages_contract_version_id_fkey
      FOREIGN KEY (contract_version_id) REFERENCES contract_versions(id);
  END IF;
END $$;

ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS state jsonb;
ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS state_expires_at timestamptz;
