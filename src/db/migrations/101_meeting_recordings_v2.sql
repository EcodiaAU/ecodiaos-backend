-- 101_meeting_recordings_v2.sql
-- Add columns needed by retranscribe endpoint, editable transcript,
-- speaker diarisation (transcript_json), and speaker name mapping.
-- Authored by fork_mp1y5cmf_fd9629 (2026-05-12).

ALTER TABLE meeting_recordings
  -- Structured transcript (engine-agnostic shape; JSONB so FE can query it)
  ADD COLUMN IF NOT EXISTS transcript_json       JSONB,

  -- Speaker label overrides: {"A": "Tate", "B": "Angelica"} etc
  ADD COLUMN IF NOT EXISTS speaker_names         JSONB DEFAULT '{}'::jsonb,

  -- Tracking for manual re-transcription (retranscribe endpoint)
  ADD COLUMN IF NOT EXISTS transcript_revised_at TIMESTAMPTZ,

  -- Tracking for hand-edited transcript (patch transcript endpoint)
  ADD COLUMN IF NOT EXISTS transcript_edited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcript_edited_by  TEXT,

  -- Which transcription engine produced this transcript
  ADD COLUMN IF NOT EXISTS transcript_engine     TEXT CHECK (transcript_engine IN ('whisper', 'deepgram', NULL)),

  -- Whether this transcript includes speaker diarisation
  ADD COLUMN IF NOT EXISTS transcript_diarised   BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast "has speaker data" filter on list view
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_diarised
  ON meeting_recordings(transcript_diarised)
  WHERE archived_at IS NULL;
