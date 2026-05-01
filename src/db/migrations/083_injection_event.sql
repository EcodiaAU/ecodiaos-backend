-- Migration 083 - injection_event table for per-turn injection telemetry.
--
-- Captures per-block (emitted/skipped/skip_reason/char_count) for the user-
-- message continuity blocks stitched on each turn by osSessionService.
-- The JSONL append at logs/telemetry/injection-events.jsonl is the hot path
-- (avoids hitting the DB on every turn); a consumer rotates the JSONL into
-- this table on a cron, mirroring the dispatchEventConsumer pattern.
--
-- Brief ref: fork_momarm6e_60920d - "trim per-turn injection blocks - dedupe
-- + relevance-gate + telemetry".

CREATE TABLE IF NOT EXISTS injection_event (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id   TEXT NOT NULL,
  turn_idx     INTEGER NOT NULL,
  block_name   TEXT NOT NULL,         -- '<now>', '<skills_surface>', etc.
  char_count   INTEGER NOT NULL DEFAULT 0,
  emitted      BOOLEAN NOT NULL,
  skip_reason  TEXT,                  -- 'not_present' | 'dedupe' | 'minimal_mode' | NULL when emitted
  hash_prefix  TEXT,                  -- first 16 chars of sha256(content), null when not_present
  minimal_mode BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_injection_event_ts
  ON injection_event (ts DESC);

CREATE INDEX IF NOT EXISTS idx_injection_event_session_turn
  ON injection_event (session_id, turn_idx);

CREATE INDEX IF NOT EXISTS idx_injection_event_block_name_ts
  ON injection_event (block_name, ts DESC);

COMMENT ON TABLE injection_event IS
  'Per-turn injection-block telemetry (emitted vs skipped, char cost, dedupe stats). See src/services/turnInjectionService.js.';
