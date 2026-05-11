-- ============================================================
-- 097_drop_imessage_substrate.sql
-- Tate-directed purge of iMessage substrate (11 May 2026 16:44 AEST)
-- Reverts to Twilio-only contact channel.
-- ============================================================

-- Drop the outbound queue table (no longer needed; Twilio-only from here)
DROP TABLE IF EXISTS imessage_outbound_queue CASCADE;

-- Remove iMessage kv_store rows (health canary, HMAC secret, seen trackers, etc.)
DELETE FROM kv_store WHERE key ILIKE 'imessage%';
DELETE FROM kv_store WHERE key = 'health.imessage_path';
DELETE FROM kv_store WHERE key ILIKE 'ceo.queued_brief.imessage%';
DELETE FROM kv_store WHERE key = 'ceo.tate.last_imessage_seen';

-- Cancel any imessage-related scheduled tasks (belt-and-braces; none currently active
-- per Part A audit, but ensures clean state across future restores)
UPDATE os_scheduled_tasks
SET status = 'cancelled'
WHERE (name ILIKE '%imessage%' OR prompt ILIKE '%imessage%')
  AND status NOT IN ('cancelled', 'completed');

-- Archive any open status_board rows that reference iMessage
-- (run individually per status-board-no-batch-case-when-update doctrine)
-- Handled by the conductor after migration execution.
