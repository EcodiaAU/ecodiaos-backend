-- 104: working_set — the conductor's typed thread-state substrate.
--
-- Replaces three scattered continuity blocks (<conductor_commitments>,
-- <thread_carry_forward>, <last_turn_breadcrumb>) with one canonical
-- table the conductor reads at turn-start via a single <working_set> block.
--
-- Hard rules (enforced in workingSetService.js, not here):
--   - Max 5 active rows; 6th push auto-parks the oldest.
--   - Auto-park after 30min with no last_touched_at update.
--   - Listeners write directly; conductor reads via _injectWorkingSet().
--
-- Trigger: fires pg_notify on the shared 'eos_listener_events' channel
-- so future listeners can react to working_set changes.
--
-- Origin: conductor-self-sufficiency-plan-2026-05-12.md §Piece 1.

CREATE TABLE IF NOT EXISTS public.working_set (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('active', 'parked', 'blocked', 'resolved')),
  blocking_on     TEXT,               -- 'tate' | 'fork:xxx' | 'external:vendor' | NULL
  intent          TEXT NOT NULL,      -- why this thread exists
  artifacts       JSONB DEFAULT '{}'::jsonb,  -- fork_ids, status_board_row, etc.
  parent_id       UUID REFERENCES public.working_set(id) ON DELETE CASCADE,
  opened_at       TIMESTAMPTZ DEFAULT NOW(),
  last_touched_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- Status index (open threads only)
CREATE INDEX IF NOT EXISTS working_set_status_idx
  ON public.working_set(status)
  WHERE closed_at IS NULL;

-- Blocked-on index (for fast lookup of blocked threads)
CREATE INDEX IF NOT EXISTS working_set_blocking_on_idx
  ON public.working_set(blocking_on)
  WHERE status = 'blocked';

-- Last-touched index (for stale-detection and oldest-active queries)
CREATE INDEX IF NOT EXISTS working_set_last_touched_idx
  ON public.working_set(last_touched_at)
  WHERE closed_at IS NULL;

-- Artifact fork_id index: listeners look up threads by artifacts->>'fork_id'
CREATE INDEX IF NOT EXISTS working_set_fork_id_idx
  ON public.working_set((artifacts->>'fork_id'))
  WHERE closed_at IS NULL;

-- pg_notify trigger: reuses the existing eos_listener_notify_compact function,
-- extended here to handle working_set rows. The compact variant avoids sending
-- large intent/artifacts blobs over the 8KB pg_notify limit.
CREATE OR REPLACE FUNCTION public.eos_listener_notify_compact()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  payload jsonb;
  row_compact jsonb;
BEGIN
  IF (TG_TABLE_NAME = 'cc_sessions') THEN
    row_compact := jsonb_build_object(
      'id',               COALESCE(NEW.id,               OLD.id),
      'status',           COALESCE(NEW.status,           OLD.status),
      'pipeline_stage',   COALESCE(NEW.pipeline_stage,   OLD.pipeline_stage),
      'codebase_id',      COALESCE(NEW.codebase_id,      OLD.codebase_id),
      'completed_at',     COALESCE(NEW.completed_at,     OLD.completed_at),
      'commit_sha',       COALESCE(NEW.commit_sha,       OLD.commit_sha),
      'confidence_score', COALESCE(NEW.confidence_score, OLD.confidence_score),
      'error_message',    COALESCE(NEW.error_message,    OLD.error_message)
    );
  ELSIF (TG_TABLE_NAME = 'email_events') THEN
    row_compact := to_jsonb(NEW);
  ELSIF (TG_TABLE_NAME = 'status_board') THEN
    row_compact := jsonb_build_object(
      'id',              COALESCE(NEW.id,              OLD.id),
      'entity_type',     COALESCE(NEW.entity_type,     OLD.entity_type),
      'entity_ref',      COALESCE(NEW.entity_ref,      OLD.entity_ref),
      'name',            COALESCE(NEW.name,            OLD.name),
      'status',          COALESCE(NEW.status,          OLD.status),
      'next_action',     COALESCE(NEW.next_action,     OLD.next_action),
      'next_action_by',  COALESCE(NEW.next_action_by,  OLD.next_action_by),
      'priority',        COALESCE(NEW.priority,        OLD.priority),
      'archived_at',     COALESCE(NEW.archived_at,     OLD.archived_at)
    );
  ELSIF (TG_TABLE_NAME = 'os_forks') THEN
    row_compact := jsonb_build_object(
      'fork_id',         COALESCE(NEW.fork_id,         OLD.fork_id),
      'parent_id',       COALESCE(NEW.parent_id,       OLD.parent_id),
      'status',          COALESCE(NEW.status,          OLD.status),
      'last_heartbeat',  COALESCE(NEW.last_heartbeat,  OLD.last_heartbeat),
      'result',          COALESCE(NEW.result,          OLD.result),
      'next_step',       COALESCE(NEW.next_step,       OLD.next_step),
      'started_at',      COALESCE(NEW.started_at,      OLD.started_at),
      'ended_at',        COALESCE(NEW.ended_at,        OLD.ended_at),
      'is_cron',         COALESCE(NEW.is_cron,         OLD.is_cron, false)
    );
  ELSIF (TG_TABLE_NAME = 'working_set') THEN
    row_compact := jsonb_build_object(
      'id',             COALESCE(NEW.id,             OLD.id),
      'topic',          COALESCE(NEW.topic,          OLD.topic),
      'status',         COALESCE(NEW.status,         OLD.status),
      'blocking_on',    COALESCE(NEW.blocking_on,    OLD.blocking_on),
      'last_touched_at',COALESCE(NEW.last_touched_at,OLD.last_touched_at),
      'closed_at',      COALESCE(NEW.closed_at,      OLD.closed_at)
    );
  ELSE
    row_compact := jsonb_build_object('id', COALESCE(NEW.id, OLD.id));
  END IF;

  payload := jsonb_build_object(
    'table',  TG_TABLE_NAME,
    'action', TG_OP,
    'row',    row_compact,
    'ts',     extract(epoch from now())
  );

  PERFORM pg_notify('eos_listener_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- working_set trigger: fire on every insert/update (table is low-volume)
DROP TRIGGER IF EXISTS trg_working_set_notify ON public.working_set;
CREATE TRIGGER trg_working_set_notify
  AFTER INSERT OR UPDATE ON public.working_set
  FOR EACH ROW EXECUTE FUNCTION public.eos_listener_notify_compact();

COMMENT ON TABLE public.working_set IS
  'Conductor typed thread state. Max 5 active rows. Auto-park stale after 30min. '
  'Replaces <conductor_commitments> + <thread_carry_forward> continuity blocks.';
