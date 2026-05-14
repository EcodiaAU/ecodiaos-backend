-- 108_observer_signals.sql — observer interventions live in their own substrate,
-- NOT in os_session_messages. Observers are meta-cognition watching the
-- conductor; they MUST NEVER appear as user-source chat to the conductor
-- (it then thinks Tate is talking and recursively responds, polluting the
-- whole context). This table is read into a <observer_signals> continuity
-- block at turn-start so the conductor sees them as ambient context, not
-- new user input.
--
-- Origin: 13 May 2026 — Tate flagged conductor was responding to its own
-- observer interventions in the main chat (saw "tate\n<observer source=...>"
-- pattern). The old _postIntervention path POSTed to /api/os-session/message
-- which is the same wire the human user types into. Architectural fix: move
-- observer output to a dedicated substrate with explicit consumer semantics.

-- Made idempotent 2026-05-14: prod had observer_signals hand-created before
-- this migration shipped, so the unguarded CREATE blocked the runner. Same
-- pattern as 117_status_board_canonical.sql.
CREATE TABLE IF NOT EXISTS observer_signals (
  id BIGSERIAL PRIMARY KEY,
  observer_name TEXT NOT NULL,          -- 'coherence' | 'actionAudit' | 'attentionEconomy' | future
  signal_kind TEXT NOT NULL,            -- 'drift_warning' | 'action_skipped' | 'leverage_misalignment' | 'mute_self' | 'conflict_resolved'
  message TEXT NOT NULL,                -- the human-readable signal text shown to conductor
  reason TEXT,                          -- one-line rationale (for observer-tuning telemetry)
  confidence NUMERIC(4,3),              -- 0.000-1.000; conductor uses to weight
  fingerprint TEXT NOT NULL,            -- hash for dedupe + self-mute detection
  consumed_at_turn TEXT,                -- conductor turn that read this signal
  acknowledged BOOLEAN DEFAULT FALSE,   -- conductor flips when it acts on signal
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Belt-and-braces if the live table was hand-created without one of these columns.
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS observer_name TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS signal_kind TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS consumed_at_turn TEXT;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes');
ALTER TABLE observer_signals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Fast lookup: ambient signals visible to next turn = unacknowledged.
-- Note: we cannot put `expires_at > NOW()` in the predicate (NOW() is not
-- immutable in index predicates). The fetchAmbient() service filters by
-- expires_at > NOW() in the WHERE clause and the planner uses this index +
-- a heap filter for the time check.
CREATE INDEX IF NOT EXISTS observer_signals_ambient_idx
  ON observer_signals (created_at DESC)
  WHERE acknowledged = FALSE;

-- Self-mute detection: same fingerprint fired N times = observer is in a loop
CREATE INDEX IF NOT EXISTS observer_signals_fingerprint_recent_idx
  ON observer_signals (observer_name, fingerprint, created_at DESC);

-- Lifecycle prune (kept light — observers can produce volume)
CREATE INDEX IF NOT EXISTS observer_signals_expired_idx
  ON observer_signals (expires_at)
  WHERE acknowledged = FALSE;

COMMENT ON TABLE observer_signals IS
  'Haiku observer interventions. Read into <observer_signals> continuity block at turn-start. NEVER routed through /api/os-session/message (that path is for human + scheduler + listener wakes only).';

-- Observer mute state: per-observer cooldown when self-detected loop.
CREATE TABLE IF NOT EXISTS observer_mute_state (
  observer_name TEXT PRIMARY KEY,
  muted_until TIMESTAMPTZ NOT NULL,
  mute_reason TEXT NOT NULL,
  fingerprint_that_triggered TEXT,
  muted_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE observer_mute_state IS
  'When an observer fires the same fingerprint 3+ times in 10min, it self-mutes for 1h. Surfaced to status_board P3 for inspection. Auto-clears at muted_until.';
