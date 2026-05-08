CREATE TABLE IF NOT EXISTS voice_transcript_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  seq int NOT NULL,
  audio_bytes int,
  mime_type text,
  transcribed_text text,
  dropped boolean NOT NULL DEFAULT false,
  drop_reason text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vtc_session_created ON voice_transcript_chunks(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vtc_created ON voice_transcript_chunks(created_at DESC);
