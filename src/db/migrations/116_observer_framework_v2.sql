-- 116_observer_framework_v2.sql — Observer Framework v2.
--
-- Extends the 108_observer_signals substrate with:
--   1. observer_signals columns: priority, ack_mode, ack_reason, ack_turn_id,
--      correlation_id, mark_false_positive — close the ack loop and enable
--      P1/P3 routing.
--   2. observer_registry — declarative observer config (replaces hardcoded
--      LISTENER_FILES allow-list for observer modules).
--   3. observer_outcomes — rolling daily telemetry per observer (fire/ack/
--      false-positive rates) powering the weekly tuning cron.
--   4. observer_pulse_state — single-row kv-like snapshot of the systemPulse
--      observer's latest compacted state-summary (Haiku rolling conversation).
--   5. observer_pulse_events — raw firehose events feeding systemPulse.
--      Capped table; only 1h retention. Different access pattern from
--      os_observations (which is structured-perception, durable).
--
-- The conductor's existing <observer_signals> turn-start block keeps working
-- unchanged; new columns default to safe values (priority=3, ack_mode=null).
--
-- Origin: Observer Framework v2 build, 13 May 2026 (Tom Grote ask:
-- "make observers actually good at their job and interact with the conductor
-- in the best way possible").

-- ─── 1. observer_signals additions ──────────────────────────────────────────

ALTER TABLE observer_signals
  ADD COLUMN IF NOT EXISTS priority SMALLINT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ack_mode TEXT,            -- 'explicit' | 'implicit' | 'auto_expired' | 'dismissed'
  ADD COLUMN IF NOT EXISTS ack_reason TEXT,
  ADD COLUMN IF NOT EXISTS ack_turn_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,       -- links cause events → signal → conductor action
  ADD COLUMN IF NOT EXISTS mark_false_positive BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS evidence_event_ids BIGINT[]; -- pointers into os_observations / observer_pulse_events

-- Priority check (1 = critical interrupt-eligible, 3 = normal ambient, 5 = info-only).
ALTER TABLE observer_signals
  ADD CONSTRAINT observer_signals_priority_chk
  CHECK (priority IN (1, 3, 5)) NOT VALID;

-- Index for P1 interrupt-eligibility check (cheap on every tool-call boundary).
CREATE INDEX IF NOT EXISTS observer_signals_p1_unack_idx
  ON observer_signals (created_at DESC)
  WHERE priority = 1 AND acknowledged = FALSE;

-- Index for tuning cron rollups.
CREATE INDEX IF NOT EXISTS observer_signals_outcomes_idx
  ON observer_signals (observer_name, created_at DESC);

COMMENT ON COLUMN observer_signals.priority IS
  '1=critical (P1 inject between tool calls), 3=normal (ambient block), 5=info (telemetry only). Default 3.';
COMMENT ON COLUMN observer_signals.ack_mode IS
  '"explicit"=conductor called mcp__observer__ack with reason. "implicit"=conductor took substantive action within ack window. "auto_expired"=hit 30min TTL. "dismissed"=explicit dismiss tool call.';
COMMENT ON COLUMN observer_signals.correlation_id IS
  'Free-form correlation token. Used to link an event chain: a perceptionBus event → systemPulse anomaly → conductor remediation. Tunable by tuning cron.';

-- ─── 2. observer_registry ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS observer_registry (
  observer_name TEXT PRIMARY KEY,
  subscribes_to TEXT[] NOT NULL,           -- event types: ['assistant_text', 'tool_use', 'perception_bus', 'pino_log', 'fe_event']
  haiku_prompt_path TEXT,                  -- relative path to prompt file, or NULL for code-embedded prompt
  buffer_size INT NOT NULL DEFAULT 20,
  rate_cap_per_hour INT NOT NULL DEFAULT 4,
  confidence_floor NUMERIC(4,3) NOT NULL DEFAULT 0.85,
  priority_default SMALLINT NOT NULL DEFAULT 3,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  narrowed_at TIMESTAMPTZ,                 -- last time triggers were tightened
  narrowed_reason TEXT,
  archived_at TIMESTAMPTZ,                 -- soft-archived (won't load) but row preserved for history
  archived_reason TEXT,
  config_json JSONB DEFAULT '{}'::jsonb,   -- observer-specific knobs (window_ms, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS observer_registry_enabled_idx
  ON observer_registry (enabled) WHERE archived_at IS NULL;

COMMENT ON TABLE observer_registry IS
  'Declarative observer configuration. Loaded at server boot by observerLoader. Replaces hardcoded LISTENER_FILES entries for the trio + future observers. Tunable knobs (confidence_floor, rate_cap_per_hour, enabled) update at next process restart.';

-- Seed registry with the existing trio + systemPulse.
INSERT INTO observer_registry (observer_name, subscribes_to, buffer_size, rate_cap_per_hour, confidence_floor, priority_default, config_json)
VALUES
  ('coherence',         ARRAY['assistant_text', 'user', 'tool_use'], 20, 4, 0.85, 3, '{"window_ms": 300000}'::jsonb),
  ('actionAudit',       ARRAY['assistant_text', 'tool_use'],         30, 4, 0.85, 3, '{"window_ms": 300000}'::jsonb),
  ('attentionEconomy',  ARRAY['assistant_text', 'tool_use'],         20, 4, 0.85, 3, '{"window_ms": 600000}'::jsonb),
  ('systemPulse',       ARRAY['perception_bus', 'pino_log', 'fe_event'], 200, 12, 0.75, 3, '{"compact_window_ms": 300000, "anomaly_severity_floor": "medium"}'::jsonb)
ON CONFLICT (observer_name) DO NOTHING;

-- ─── 3. observer_outcomes (rolling daily telemetry) ─────────────────────────

CREATE TABLE IF NOT EXISTS observer_outcomes (
  id BIGSERIAL PRIMARY KEY,
  observer_name TEXT NOT NULL,
  day DATE NOT NULL,
  fired INT NOT NULL DEFAULT 0,
  ack_explicit INT NOT NULL DEFAULT 0,
  ack_implicit INT NOT NULL DEFAULT 0,
  ack_dismissed INT NOT NULL DEFAULT 0,
  ack_expired INT NOT NULL DEFAULT 0,
  marked_false_positive INT NOT NULL DEFAULT 0,
  avg_confidence NUMERIC(4,3),
  p1_fired INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (observer_name, day)
);

CREATE INDEX IF NOT EXISTS observer_outcomes_day_idx
  ON observer_outcomes (day DESC, observer_name);

COMMENT ON TABLE observer_outcomes IS
  'Daily rollup per observer. Populated by the daily tuning cron from observer_signals. Drives weekly tuning recommendations (auto-narrow, auto-archive).';

-- ─── 4. observer_pulse_state ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS observer_pulse_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforce single row
  last_compaction_at TIMESTAMPTZ,
  state_summary TEXT,                          -- Haiku-compacted state snapshot
  events_observed_since_boot BIGINT DEFAULT 0,
  anomalies_flagged_since_boot BIGINT DEFAULT 0,
  current_state_json JSONB DEFAULT '{}'::jsonb, -- structured fields if Haiku returns them
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize the single row.
INSERT INTO observer_pulse_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE observer_pulse_state IS
  'systemPulse rolling state — last Haiku-compacted summary + counters. Single-row kv-style table (id=1). Read by debug endpoints + admin lens.';

-- ─── 5. observer_pulse_events (firehose, short retention) ───────────────────

CREATE TABLE IF NOT EXISTS observer_pulse_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,                  -- 'perception_bus' | 'pino' | 'fe_console' | 'fe_error' | 'fe_route' | 'fe_ws'
  level TEXT,                            -- 'info' | 'warn' | 'error' | 'debug' (where applicable)
  kind TEXT,                             -- event sub-type (e.g. 'fork_complete', 'route_change', 'ws_disconnect')
  payload JSONB,                         -- event body (raw, may be redacted)
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS observer_pulse_events_ts_idx
  ON observer_pulse_events (ts DESC);

CREATE INDEX IF NOT EXISTS observer_pulse_events_source_ts_idx
  ON observer_pulse_events (source, ts DESC);

COMMENT ON TABLE observer_pulse_events IS
  'Firehose feeding systemPulse. perceptionBus + Pino tail + FE console proxy all append here. Prune cron keeps only last 1h (this is a state-snapshot input, not durable telemetry). For durable structured events use os_observations.';

-- 1h retention prune (called by daily cron / nightly maintenance).
-- We do NOT use a trigger here because high-frequency INSERTs would amplify
-- trigger cost; prune is async + cheap on the indexed (ts) column.

COMMIT;
