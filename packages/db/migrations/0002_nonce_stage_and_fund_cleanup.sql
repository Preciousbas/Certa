ALTER TABLE capture_nonces ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES stages(id);

DELETE FROM payments WHERE id = '7786f304-faf8-45e7-9aab-6b4df6882c8e';
