-- Photo verification columns. Existing photo and submission rows stay valid.

ALTER TABLE photos ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES stages(id);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES users(id);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS accuracy_m real;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS distance_from_site_m real;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS exif jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS nonce text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS original_key text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS width_px integer;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS height_px integer;

CREATE INDEX IF NOT EXISTS photos_stage_id ON photos (stage_id);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
  CHECK (status IS NULL OR status IN ('received', 'verifying', 'verified', 'rejected_checks'));

CREATE TABLE IF NOT EXISTS ai_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id),
  stage_id uuid NOT NULL REFERENCES stages(id),
  model text NOT NULL,
  prompt_version text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('pass', 'fail', 'unsure')),
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  raw_json jsonb NOT NULL,
  criteria_results jsonb NOT NULL,
  reasons text[] NOT NULL,
  issues text[] NOT NULL,
  safety_flags text[] NOT NULL DEFAULT '{}',
  missing_shots text[] NOT NULL DEFAULT '{}',
  latency_ms integer,
  cost_micro bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_verdicts_stage_created ON ai_verdicts (stage_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_verdicts_submission ON ai_verdicts (submission_id);

ALTER TABLE ai_verdicts ENABLE ROW LEVEL SECURITY;
