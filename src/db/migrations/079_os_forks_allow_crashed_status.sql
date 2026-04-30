-- Migration: allow 'crashed' in os_forks.status check constraint.
--
-- Why: forkService.recoverStaleForks (src/services/forkService.js:792) writes
--      status='crashed' on stale mid-flight forks at API boot. The constraint
--      defined in 062_os_forks.sql allowed only:
--        [spawning, running, reporting, done, aborted, error]
--      Every recovery attempt silently failed at the DB layer, leaving phantom
--      'running' rows accumulating across PM2 restarts.
--
-- Diagnosed in main conductor session 2026-05-01 ~01:30 AEST after observing
-- repeated `forkService.recoverStaleForks: query failed (non-fatal)` log lines
-- across 5 boots in 21 minutes (14:55-15:16 UTC 30 Apr 2026), with 4 phantom
-- rows in os_forks status='running' that never cleaned up.
--
-- This migration adds 'crashed' to the allowed set. Recovery loop now succeeds.
-- Idempotent: drops the constraint if present, then re-adds with the expanded
-- allowed set.

ALTER TABLE os_forks DROP CONSTRAINT IF EXISTS os_forks_status_check;

ALTER TABLE os_forks ADD CONSTRAINT os_forks_status_check
  CHECK (status = ANY (ARRAY[
    'spawning'::text,
    'running'::text,
    'reporting'::text,
    'done'::text,
    'aborted'::text,
    'error'::text,
    'crashed'::text
  ]));

COMMENT ON CONSTRAINT os_forks_status_check ON os_forks IS
  'Allowed fork lifecycle statuses. crashed = recovered by recoverStaleForks() at API boot when a row had been mid-flight (spawning/running/reporting) but the heartbeat went stale (>2 min) — typically PM2 restart killed the process holding the SDK stream.';
