-- 110_meeting_attendees.sql
-- Adds a free-text attendees field so users can tell Claude who was in the
-- room (e.g. "Kurt, Tate, Angelica, Richard") without needing to map each
-- Deepgram speaker letter manually. The analysis prompt uses this to
-- attribute commitments and decisions to real names from context.

ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS attendees TEXT;
