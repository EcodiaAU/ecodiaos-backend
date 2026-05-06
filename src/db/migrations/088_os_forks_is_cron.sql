-- 088: os_forks.is_cron - cron-routed fork suppression flag
--
-- Tate verbatim 7 May 2026 09:15 AEST: "is it not a deeper problem bro...
-- stop bullshitting me. You need to just stop whatever is triggering you
-- there, because you're going to have to return something regardlesss....
-- it should jsut be handled by a fork that you can ignore unless needed."
--
-- Origin failure: every cron-routed fork's [FORK_REPORT] arrives at the
-- conductor as a `[SYSTEM: fork_report ...]` queue message that forces a
-- conductor turn (even if the response is just "Idle."). This is noise
-- pollution at the conductor turn substrate, distinct from the doctrine
-- layer (~/ecodiaos/patterns/crons-route-to-forks-by-default.md), which
-- only governs the cron-prompt routing - NOT the fork-report return path.
--
-- Architectural fix: cron-routed-fork reports land in passive substrate
-- (forks_rollup context block + status_board + perception_dispatcher
-- events) but are NOT enqueued into messageQueue and do NOT wake the
-- conductor via /api/os-session/message. The conductor sees outcomes via
-- <forks_rollup> on the next natural turn (e.g. when meta-loop fires or
-- Tate types). Genuine emergencies surface via existing perception events
-- and status_board P1 rows - those paths remain intact.
--
-- This migration adds the boolean flag and plumbs it into the pg_notify
-- payload so listeners/forkComplete.js can suppress the wake without
-- needing an extra DB query per terminal event.
--
-- Doctrine: ~/ecodiaos/patterns/cron-fork-reports-route-to-substrate-not-conductor-turn.md
-- Sibling: ~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md
--          (Tate 5 May 2026 12:40 AEST - the same principle for fork errors)
-- Parent:  ~/ecodiaos/patterns/crons-route-to-forks-by-default.md (4 May 2026)

-- Step 1: column add (idempotent).
ALTER TABLE os_forks ADD COLUMN IF NOT EXISTS is_cron BOOLEAN NOT NULL DEFAULT false;

-- Step 2: index for analytics ("how many cron forks today / by hour").
-- Partial index on is_cron=true keeps it small; cron forks are a minority of
-- total fork rows and the dominant query is "find me the cron fires".
CREATE INDEX IF NOT EXISTS idx_os_forks_is_cron_started
  ON os_forks (started_at DESC)
  WHERE is_cron = true;

-- Step 3: extend pg_notify trigger function so listeners see is_cron in the
-- compact payload (no DB query needed in the listener handler hot path).
-- Preserves existing behaviour for cc_sessions, email_events, status_board,
-- and adds is_cron to the os_forks branch.
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

-- Trigger from migration 064 stays as-is - fires on UPDATE of (status,
-- last_heartbeat). The reloaded function is picked up by Postgres
-- automatically; no trigger redefinition needed. Stamp: fork_mouofp9r_72cd3a.
COMMENT ON COLUMN os_forks.is_cron IS
  'true when fork was spawned by cronForkDispatcher (cron-routed). Cron-routed forks suppress messageQueue enqueue + forkComplete wake to keep their reports passive (forks_rollup substrate only, never force a conductor turn). Set at INSERT by cronForkDispatcher, never mutated. Migration 088 (fork_mouofp9r_72cd3a, 7 May 2026).';
