ALTER TABLE projects ADD COLUMN IF NOT EXISTS chain_sync text NOT NULL DEFAULT 'ok';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_chain_sync_check;
ALTER TABLE projects ADD CONSTRAINT projects_chain_sync_check CHECK (chain_sync IN ('ok', 'updating'));

ALTER TABLE chain_txs ADD COLUMN IF NOT EXISTS nonce bigint;
ALTER TABLE chain_txs ADD COLUMN IF NOT EXISTS intent text;
ALTER TABLE chain_txs ADD COLUMN IF NOT EXISTS replaced_hash text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'wallets'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%purpose%'
  LOOP
    EXECUTE format('ALTER TABLE wallets DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE wallets ADD CONSTRAINT wallets_purpose_check CHECK (
  purpose IN ('client', 'consultant', 'contractor', 'subcontractor', 'operator', 'agent_x402', 'treasury')
);
