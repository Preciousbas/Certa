ALTER TABLE memberships ADD COLUMN IF NOT EXISTS notify_channel text NOT NULL DEFAULT 'telegram';
