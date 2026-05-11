-- 100_meeting_recordings.sql
-- Meeting recordings table for Phase 1: capture + durable storage + Whisper transcription.
-- Authored by fork_mp1utwce_96fdc9 (2026-05-12).

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                TIMESTAMPTZ,
  duration_seconds        INTEGER,

  -- Audio storage (Supabase documents bucket)
  audio_url               TEXT,         -- path: meetings/<id>/audio.webm
  audio_format            TEXT DEFAULT 'webm',
  audio_size_bytes        BIGINT,

  -- Transcription
  transcript_text         TEXT,
  transcript_url          TEXT,         -- path: meetings/<id>/transcript.txt

  -- Transcription lifecycle
  transcription_status    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (transcription_status IN ('pending','processing','done','error','uploaded_awaiting_transcription')),
  transcription_error     TEXT,

  -- CRM linkage (nullable)
  client_id               UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id              UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Metadata
  title                   TEXT,
  created_by              TEXT DEFAULT 'tate',

  -- Soft delete + audit
  archived_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started_at  ON meeting_recordings(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_status      ON meeting_recordings(transcription_status);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_client_id   ON meeting_recordings(client_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_archived    ON meeting_recordings(archived_at) WHERE archived_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_meeting_recordings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_recordings_updated_at ON meeting_recordings;
CREATE TRIGGER trg_meeting_recordings_updated_at
  BEFORE UPDATE ON meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION update_meeting_recordings_updated_at();

-- RLS enabled; backend uses service_role key (bypasses RLS)
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;
