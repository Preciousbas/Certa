ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_pin_source text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_pin_label text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_pin_set_at timestamptz;
UPDATE projects SET site_pin_source = 'legacy', site_pin_set_at = now()
  WHERE site_pin_source IS NULL AND NOT (site_lat = 0 AND site_lng = 0);
