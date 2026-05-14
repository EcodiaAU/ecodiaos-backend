-- 118: observation retention cron
--
-- High-frequency observation tables have no purge story today:
--   observer_signals       (expires_at default NOW()+30min, but no DELETE job)
--   os_observations        (no retention column, no purge)
--   observer_pulse_events  (migration 116 comment says "prune cron keeps last 1h", no cron)
--   session_memory_chunks  (unbounded; voice + embeddings forecast multi-GB/6mo)
--   gkg_events             (encrypted payloads, ~4.4 GB/month forecast)
--   compaction_events      (per-turn rows, low volume but unpruned)
--
-- This migration registers a daily direct-exec cron `observation-retention-cleanup`
-- in os_scheduled_tasks. The actual shell command (a node one-liner running
-- src/db/cron/observationRetention.js) is registered in src/config/cronPriority.js
-- under DIRECT_EXEC_CRONS so schedulerPollerService runs it via spawnSync with
-- zero fork/credit cost, surviving account-chain exhaustion.
--
-- The retention windows below were chosen conservatively. Adjust by editing the
-- node script; this migration only schedules the runner.
--
-- Origin: AUTONOMY_AUDIT_2026-05-13 (data layer audit, finding 42 of 44).

INSERT INTO os_scheduled_tasks (name, type, status, priority, cron_expression, next_run_at, payload)
VALUES (
  'observation-retention-cleanup',
  'cron',
  'active',
  'normal',
  '0 16 * * *',                              -- 02:00 AEST (16:00 UTC)
  date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '16 hours',
  jsonb_build_object(
    'description', 'Daily purge of observation tables. Pure SQL via direct-exec.',
    'tables', jsonb_build_array(
      'observer_signals',
      'os_observations',
      'observer_pulse_events',
      'session_memory_chunks',
      'gkg_events',
      'compaction_events'
    )
  )
)
ON CONFLICT DO NOTHING;

-- Defensive: if observer_pulse_events table from migration 116 has no expires_at
-- check, ensure the partial index for the 1h retention is present so the DELETE
-- runs in O(log n).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observer_pulse_events') THEN
    CREATE INDEX IF NOT EXISTS observer_pulse_events_ts_purge_idx
      ON observer_pulse_events (ts)
      WHERE ts < NOW() - INTERVAL '1 hour';
  END IF;
END $$;

-- Same for observer_signals: index on expires_at for the purge query.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'observer_signals') THEN
    CREATE INDEX IF NOT EXISTS observer_signals_expired_idx
      ON observer_signals (expires_at)
      WHERE expires_at IS NOT NULL;
  END IF;
END $$;
