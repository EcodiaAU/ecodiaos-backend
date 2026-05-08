-- 094_add_retention_columns.sql
-- [fork_mowk9wfl_0b18b8 spring-clean worker 2]
-- Adds archived_at + retention_note columns to retention-eligible tables so the
-- spring-clean retention policy (drafts/supabase-retention-policy-2026-05-08.md)
-- can be enacted non-destructively (set archived_at instead of DELETE).
--
-- Tables: cc_sessions, os_forks, staged_transactions, email_threads, action_queue
-- All adds are idempotent (IF NOT EXISTS) and indexed for the
--   "WHERE archived_at IS NULL" hot path.

-- cc_sessions
ALTER TABLE cc_sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE cc_sessions
  ADD COLUMN IF NOT EXISTS retention_note TEXT;
CREATE INDEX IF NOT EXISTS idx_cc_sessions_archived_at
  ON cc_sessions (archived_at);
CREATE INDEX IF NOT EXISTS idx_cc_sessions_active
  ON cc_sessions (started_at)
  WHERE archived_at IS NULL;

-- os_forks
ALTER TABLE os_forks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE os_forks
  ADD COLUMN IF NOT EXISTS retention_note TEXT;
CREATE INDEX IF NOT EXISTS idx_os_forks_archived_at
  ON os_forks (archived_at);
CREATE INDEX IF NOT EXISTS idx_os_forks_active
  ON os_forks (status, ended_at)
  WHERE archived_at IS NULL;

-- staged_transactions
ALTER TABLE staged_transactions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE staged_transactions
  ADD COLUMN IF NOT EXISTS retention_note TEXT;
CREATE INDEX IF NOT EXISTS idx_staged_transactions_archived_at
  ON staged_transactions (archived_at);

-- email_threads
ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE email_threads
  ADD COLUMN IF NOT EXISTS retention_note TEXT;
CREATE INDEX IF NOT EXISTS idx_email_threads_archived_at
  ON email_threads (archived_at);

-- action_queue
ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE action_queue
  ADD COLUMN IF NOT EXISTS retention_note TEXT;
CREATE INDEX IF NOT EXISTS idx_action_queue_archived_at
  ON action_queue (archived_at);

COMMENT ON COLUMN cc_sessions.archived_at IS
  'Set when row is retired by retention policy. NULL = active. See drafts/supabase-retention-policy-2026-05-08.md';
COMMENT ON COLUMN os_forks.archived_at IS
  'Set when row is retired by retention policy. NULL = active. See drafts/supabase-retention-policy-2026-05-08.md';
COMMENT ON COLUMN staged_transactions.archived_at IS
  'Set when row is retired by retention policy. NULL = active. See drafts/supabase-retention-policy-2026-05-08.md';
COMMENT ON COLUMN email_threads.archived_at IS
  'Set when row is retired by retention policy. NULL = active. See drafts/supabase-retention-policy-2026-05-08.md';
COMMENT ON COLUMN action_queue.archived_at IS
  'Set when row is retired by retention policy. NULL = active. See drafts/supabase-retention-policy-2026-05-08.md';
