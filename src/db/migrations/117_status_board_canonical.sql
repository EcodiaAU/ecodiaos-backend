-- 117: status_board canonical CREATE TABLE
--
-- status_board is the single source of truth for what EcodiaOS is attending to.
-- It has been live in production since early 2026 via hand-run SQL on the VPS,
-- but no migration ever created it. Migration 063 adds a trigger to the table
-- and 067 ALTERs columns on it -- both assume the table already exists, which
-- breaks first-time deploys (staging, docker-compose, fresh DB).
--
-- This migration codifies the canonical shape. It is idempotent (CREATE TABLE
-- IF NOT EXISTS + ADD COLUMN IF NOT EXISTS), so it is safe to run on the live
-- VPS database where the table already exists.
--
-- Column shape was reverse-engineered from real query patterns across services,
-- routes, listeners, and matchers. Every column is required by at least one
-- live caller; nothing speculative.
--
-- Origin: AUTONOMY_AUDIT_2026-05-13 finding (data layer audit, P0).

CREATE TABLE IF NOT EXISTS public.status_board (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_ref TEXT,
  name TEXT NOT NULL,
  status TEXT,
  next_action TEXT,
  next_action_by TEXT,
  next_action_due TIMESTAMPTZ,
  priority SMALLINT DEFAULT 3,
  context TEXT,
  last_touched TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'conductor',
  cowork_session_id TEXT
);

-- Belt-and-braces: if the table existed without one of these columns (drift
-- from earlier ad-hoc creation), the ADD COLUMN IF NOT EXISTS makes it
-- self-healing without re-creating.
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS entity_ref TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS next_action_by TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS next_action_due TIMESTAMPTZ;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS priority SMALLINT DEFAULT 3;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS last_touched TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'conductor';
ALTER TABLE public.status_board ADD COLUMN IF NOT EXISTS cowork_session_id TEXT;

CREATE INDEX IF NOT EXISTS status_board_active_priority_idx
  ON public.status_board (priority, entity_type)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS status_board_next_action_by_idx
  ON public.status_board (next_action_by)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS status_board_next_action_due_idx
  ON public.status_board (next_action_due)
  WHERE archived_at IS NULL AND next_action_due IS NOT NULL;

CREATE INDEX IF NOT EXISTS status_board_name_active_idx
  ON public.status_board (name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS status_board_source_idx
  ON public.status_board (source);

CREATE INDEX IF NOT EXISTS status_board_cowork_session_idx
  ON public.status_board (cowork_session_id)
  WHERE cowork_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS status_board_last_touched_idx
  ON public.status_board (last_touched DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.status_board IS
  'Single source of truth for active work. Conductor queries on every turn. Update or archive on every action.';
COMMENT ON COLUMN public.status_board.entity_type IS
  'client | project | thread | task | opportunity | personal | legal | infrastructure | observer';
COMMENT ON COLUMN public.status_board.next_action_by IS
  'ecodiaos | tate | client | external | observer';
COMMENT ON COLUMN public.status_board.priority IS
  '1 (critical) through 5 (low). 4 is the canonical level for observer-mirrored rows.';
COMMENT ON COLUMN public.status_board.source IS
  'Writer identity: conductor | cowork | tate | external | observer:<name>.';
