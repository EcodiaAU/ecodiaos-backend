-- 2026-05-18: schema drift fix for outbound_email_delay_queue.
--
-- The worker (src/workers/outboundEmailDelayQueueWorker.js) and service
-- (src/services/outboundEmailDelayQueue.js) reference two columns that
-- migration 075 never created:
--
--   - `attempts` (used by _releaseClaimForRetry: `attempts = COALESCE(attempts, 0) + 1`
--     and the >=5 → 'error' guard). Without this column, retry path crashes
--     and the queue silently swallows the failure.
--   - `sending_started_at` (used by claimNextReady to mark when a worker
--     atomically claimed a row, and by _releaseClaimForRetry to reset it
--     on retry). Without this, multiple workers could race; we have one
--     worker today but the FOR UPDATE SKIP LOCKED + status='sending'
--     guard still relies on the column existing for observability.
--
-- Discovered while debugging the Tier-3 gate + delay-queue flow for the
-- Co-Exist email correction send on 2026-05-18. Audit 2026-05-13 P0 #21
-- closed the "no consumer" loop but missed this drift.
--
-- Idempotent via IF NOT EXISTS.

ALTER TABLE outbound_email_delay_queue
  ADD COLUMN IF NOT EXISTS attempts            INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sending_started_at  TIMESTAMPTZ;

-- Helpful index for the worker's WHERE status='approved' AND release_at <= NOW() poll.
CREATE INDEX IF NOT EXISTS outbound_email_delay_queue_ready_idx
  ON outbound_email_delay_queue (status, release_at)
  WHERE status = 'approved';
