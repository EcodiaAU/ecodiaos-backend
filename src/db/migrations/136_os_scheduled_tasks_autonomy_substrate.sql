-- 136_os_scheduled_tasks_autonomy_substrate.sql
-- Adds columns + status values for the autonomy substrate (scheduler module on
-- eos-laptop-agent). See docs/superpowers/specs/2026-05-26-autonomy-substrate-design.md
-- and docs/superpowers/plans/2026-05-26-autonomy-substrate.md Task 0.8.

BEGIN;

ALTER TABLE os_scheduled_tasks
  ADD COLUMN IF NOT EXISTS preferred_account text,
  ADD COLUMN IF NOT EXISTS actual_account text,
  ADD COLUMN IF NOT EXISTS leased_by text,
  ADD COLUMN IF NOT EXISTS leased_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_tab_id text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_result text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3;
  -- priority: 1 highest, 5 lowest. Default 3. Used by scheduler dispatch ORDER BY.

-- Replace status CHECK constraint if it exists, with the expanded set.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'os_scheduled_tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE os_scheduled_tasks DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE os_scheduled_tasks
  ADD CONSTRAINT os_scheduled_tasks_status_check
  CHECK (status IN ('active', 'paused', 'cancelled', 'dispatching', 'running', 'completed', 'failed', 'orphaned'));
  -- 'cancelled' preserved from pre-substrate history (217 rows at time of migration).

CREATE UNIQUE INDEX IF NOT EXISTS os_scheduled_tasks_idempotency_key_idx
  ON os_scheduled_tasks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_due_idx
  ON os_scheduled_tasks (next_run_at, priority)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS os_scheduled_tasks_lease_idx
  ON os_scheduled_tasks (leased_at)
  WHERE status IN ('dispatching', 'running');

COMMIT;
