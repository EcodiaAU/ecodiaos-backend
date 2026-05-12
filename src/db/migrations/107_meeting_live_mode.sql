-- 107_meeting_live_mode.sql
--
-- Adds live-mode timestamps to meeting_recordings so we can distinguish
-- realtime-streamed meetings from batch-uploaded recordings. Used by:
--   /api/meetings/:id/live  (Deepgram Nova-3 WSS streaming, 12 May 2026)
--   meetingsLiveTranscription.js
--
-- live_started_at fires on first WS handshake; live_ended_at on socket close.
-- Both nullable - existing rows + batch uploads stay NULL.

ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_live_started
  ON meeting_recordings(live_started_at DESC)
  WHERE live_started_at IS NOT NULL;
