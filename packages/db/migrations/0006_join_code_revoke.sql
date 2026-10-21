ALTER TABLE join_codes ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
