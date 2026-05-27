-- 138_conductor_claims.sql
-- Multi-conductor coordination substrate. Layer 5 of the 24/7 autonomy spec
-- (backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md).
--
-- Problem: multiple conductor sessions can run simultaneously (Cursor chat on
-- Corazon, iOS native conductor, voice conductor, cron-spawned worker tabs).
-- Each writes to status_board, working_set, email_threads etc. Without a
-- claim primitive, two conductors can both pick up the same email thread or
-- status_board row and double-act (duplicate sends, conflicting writes).
--
-- Pattern: lease-then-act. Conductor calls claimsService.acquire(entity_type,
-- entity_ref, conductor_id). If returned row -> proceed. If null -> someone
-- else owns it, defer. TTL auto-expires stale claims (conductor crashed
-- mid-act).
--
-- Renewal: long-running work calls .touch(id) to extend expiry. Default TTL
-- 30min covers most conductor turns; explicit .release(id) on natural end.
--
-- NAMING NOTE: a table named `conductor_claims` already exists from prior
-- decision-quality telemetry work (turn_id / session_id / action / handle_kv
-- shape). To avoid collision, this lease substrate uses `coordination_claims`.
-- Companion service: src/services/conductorClaimsService.js.

CREATE TABLE IF NOT EXISTS coordination_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor_id text NOT NULL,
  entity_type text NOT NULL,
  entity_ref text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL,
  released_at timestamptz NULL,
  outcome text NULL,
  context jsonb NULL,
  CONSTRAINT coordination_claims_entity_type_check CHECK (
    entity_type IN (
      'status_board_row',
      'email_thread',
      'approval_queue_item',
      'scheduled_task',
      'observer_signal',
      'pending_restart_request',
      'working_set_thread',
      'custom'
    )
  )
);

-- Unique unreleased claim per (entity_type, entity_ref). NOW() can't appear in
-- the index predicate (must be IMMUTABLE), so the acquire-path checks
-- expires_at vs. NOW() in the lookup query, and the sweep cron writes
-- released_at = NOW() on expired rows to free the slot.
CREATE UNIQUE INDEX IF NOT EXISTS coordination_claims_active_uniq
  ON coordination_claims (entity_type, entity_ref)
  WHERE released_at IS NULL;

-- Cheap lookup of all unreleased claims by a given conductor.
CREATE INDEX IF NOT EXISTS coordination_claims_by_conductor_active
  ON coordination_claims (conductor_id, expires_at)
  WHERE released_at IS NULL;

-- Cheap lookup for sweeper that releases expired claims.
CREATE INDEX IF NOT EXISTS coordination_claims_expired_sweep
  ON coordination_claims (expires_at)
  WHERE released_at IS NULL;

COMMENT ON TABLE coordination_claims IS 'Multi-conductor coordination lease table. See backend/src/services/conductorClaimsService.js for the lease/release API. Layer 5 of the 24/7 autonomy architecture.';
