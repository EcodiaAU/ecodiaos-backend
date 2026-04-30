-- Fork atomicity + split-brain arbitration.
-- See docs/FORK_ATOMICITY_SPEC.md §2 and §4.

-- §2 Atomic fork cap: partial index makes the live-count subquery fast.
CREATE INDEX IF NOT EXISTS os_forks_live_status_idx
  ON os_forks (status)
  WHERE status IN ('spawning','running','reporting');

-- §4 Split-brain arbitration between VPS and Corazon laptop.
-- Two brains, one task queue. Advisory lock per task_id prevents both
-- brains committing the same action (classic: both send the same email
-- after laptop wakes from sleep -> double-send).
CREATE TABLE IF NOT EXISTS task_leases (
  task_id TEXT PRIMARY KEY,
  brain_id TEXT NOT NULL,              -- 'vps-conductor' | 'corazon-agent' | etc.
  lock_key BIGINT NOT NULL,            -- hash(task_id) as used by pg_advisory_lock
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS task_leases_expires_idx
  ON task_leases (expires_at);
CREATE INDEX IF NOT EXISTS task_leases_brain_idx
  ON task_leases (brain_id, acquired_at DESC);
