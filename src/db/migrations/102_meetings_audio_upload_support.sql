-- 102_meetings_audio_upload_support.sql
-- Adds audio_source + audio_uploaded_at columns to support the mp3 upload
-- rescue path for meetings whose live capture was lost.
-- Also fixes the transcription_status CHECK constraint which was missing 'retrying'
-- (the retranscribe endpoint already sets this value, so the constraint was too narrow).
--
-- Authored by fork_mp216frz_c7d55f (2026-05-12).
-- DO NOT RUN manually — let the conductor apply this in the restart-approval window.

-- 1. New columns for uploaded audio tracking
ALTER TABLE meeting_recordings
  ADD COLUMN IF NOT EXISTS audio_source       TEXT DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS audio_uploaded_at  TIMESTAMPTZ;

-- 2. Add CHECK on audio_source (separate statement so IF NOT EXISTS on column above is safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_recordings_audio_source_check'
      AND conrelid = 'meeting_recordings'::regclass
  ) THEN
    ALTER TABLE meeting_recordings
      ADD CONSTRAINT meeting_recordings_audio_source_check
      CHECK (audio_source IN ('live', 'uploaded'));
  END IF;
END;
$$;

-- 3. Widen transcription_status CHECK to include 'retrying' (bugfix — retranscribe endpoint
--    already writes this value but the constraint did not allow it) and 'uploading'
--    (transitional state while the file is being received, reserved for future use).
ALTER TABLE meeting_recordings
  DROP CONSTRAINT IF EXISTS meeting_recordings_transcription_status_check;

ALTER TABLE meeting_recordings
  ADD CONSTRAINT meeting_recordings_transcription_status_check
  CHECK (transcription_status IN (
    'pending',
    'processing',
    'retrying',
    'uploading',
    'done',
    'error',
    'uploaded_awaiting_transcription'
  ));
