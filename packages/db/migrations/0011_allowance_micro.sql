ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowance_micro bigint NOT NULL DEFAULT 0 CHECK (allowance_micro >= 0);

UPDATE workspaces
SET allowance_micro = x402_allowance_usdc
WHERE allowance_micro = 0 AND x402_allowance_usdc > 0;
