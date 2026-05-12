-- 109_dispatch_event_dedup.sql
--
-- Critique 01 graduation: phase-G-audit-2026-05-12/critique-01-dispatch-dedup
--
-- Problem
-- -------
-- The dispatch_event consumer backfill created 2.76x row multiplication per
-- fork_id: 468 unique forks but 1294 dispatch_event rows at audit time.
-- All Layer 4 metrics (success_rate 59.4%, correction_rate 0.9%) were computed
-- on a denominator 2.77x too large. Root cause: the consumer replays processed
-- JSONL files multiple times under certain restart/backfill scenarios and had
-- no idempotency guard at the DB layer.
--
-- Fix
-- ---
-- 1. Dedup existing fork_spawn rows: for each fork_id, keep the single row
--    with the minimum id (earliest insert). Delete all other duplicates.
--    Uses a safe CTE pattern (DELETE ... WHERE id NOT IN (...)) with an
--    idempotent WHERE clause so re-running is harmless.
--
-- 2. Add a UNIQUE partial index on (metadata->>'fork_id') covering only
--    fork_spawn rows that have a non-null fork_id. This is a partial functional
--    index - it does not add a column, just enforces the constraint at write
--    time so the consumer's ON CONFLICT DO NOTHING is effective.
--
-- The consumer (dispatchEventConsumer.js) is updated in a paired code change
-- to insert with ON CONFLICT DO NOTHING so duplicate replays are silently
-- discarded rather than blindly inserted.
--
-- Origin: fork_mp354iyq_3aef74, Critique 01 graduation, 12 May 2026.
-- See ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
-- Layer 4 for architectural context.

-- Step 1: Remove duplicate fork_spawn rows, keeping only min(id) per fork_id.
-- The subquery is stable because DISTINCT ON ... ORDER BY ... id is deterministic.
-- Idempotent: if no duplicates exist this is a no-op.
DELETE FROM dispatch_event
WHERE action_type = 'fork_spawn'
  AND metadata->>'fork_id' IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (metadata->>'fork_id') id
    FROM dispatch_event
    WHERE action_type = 'fork_spawn'
      AND metadata->>'fork_id' IS NOT NULL
    ORDER BY metadata->>'fork_id', id
  );

-- Step 2: Add UNIQUE partial index so future inserts with an already-seen
-- fork_id silently conflict (consumer uses ON CONFLICT DO NOTHING).
-- IF NOT EXISTS makes the migration idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_event_fork_id_unique
  ON dispatch_event ((metadata->>'fork_id'))
  WHERE action_type = 'fork_spawn'
    AND metadata->>'fork_id' IS NOT NULL;
