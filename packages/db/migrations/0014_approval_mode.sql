ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_mode text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_mode_set_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consultant_from_stage integer;
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT projects_approval_mode_check
    CHECK (approval_mode IS NULL OR approval_mode IN ('consultant', 'client'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE projects p SET approval_mode = 'consultant', approval_mode_set_at = now()
  WHERE approval_mode IS NULL AND EXISTS (
    SELECT 1 FROM memberships m WHERE m.project_id = p.id AND m.role = 'consultant' AND m.status = 'active');
