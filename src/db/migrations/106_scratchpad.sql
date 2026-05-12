-- Migration 106: Scratchpad substrate
-- Replaces [APPLIED]/[NOT-APPLIED] chat-tag narration with silent DB writes.
-- Conductor calls mcp__scratchpad__write() instead of emitting tag text.
-- Origin: fork_mp27sa0a_67954f, 2026-05-12.

CREATE TABLE IF NOT EXISTS scratchpad_entries (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id BIGINT,
  kind TEXT NOT NULL CHECK (kind IN ('plan','pattern_applied','pattern_not_applied','decision','observation','retry','blocker')),
  content TEXT NOT NULL,
  thread_id UUID,                      -- references working_set(id) - FK added conditionally below
  pattern_path TEXT,
  reason TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scratchpad_session_ts_idx ON scratchpad_entries (session_id, ts DESC);
CREATE INDEX IF NOT EXISTS scratchpad_thread_idx ON scratchpad_entries (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scratchpad_kind_idx ON scratchpad_entries (kind, ts DESC);

-- Add FK to working_set only if that table exists (migration 104 may or may not be present)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'working_set') THEN
    IF NOT EXISTS (
      SELECT FROM information_schema.table_constraints
      WHERE constraint_name = 'scratchpad_thread_fk'
        AND table_name = 'scratchpad_entries'
    ) THEN
      ALTER TABLE scratchpad_entries ADD CONSTRAINT scratchpad_thread_fk
        FOREIGN KEY (thread_id) REFERENCES working_set(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
