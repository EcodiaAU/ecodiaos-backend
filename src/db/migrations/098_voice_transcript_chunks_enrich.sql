-- ============================================================
-- 098_voice_transcript_chunks_enrich.sql
-- Voice transcript substrate enrichment (12 May 2026)
--
-- Adds audio retention pointer, model metadata, source tag,
-- timing fields, and session-message linkage to the existing
-- voice_transcript_chunks table so every chunk has:
--   - audio_storage_path: deterministic path in voice-chunks bucket
--   - model: which Whisper variant transcribed it (for re-transcription)
--   - language: detected/forced language code
--   - confidence: future field, NULL from whisper-1 basic API
--   - source: which UI surface produced it (voice-page | chat-page)
--   - os_session_message_id: linkage when chunk was fwd'd to conductor
--   - started_at / ended_at: server-side timing window for the chunk
--
-- Origin: fork_mp1tkua0_bd9165 (voice transcript substrate brief)
-- Tate verbatim 12 May 2026 09:14 AEST: "get a transcript so we can
-- analyse and extract from it later on"
-- ============================================================

ALTER TABLE voice_transcript_chunks
  ADD COLUMN IF NOT EXISTS model                TEXT,
  ADD COLUMN IF NOT EXISTS language             TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS confidence           NUMERIC,
  ADD COLUMN IF NOT EXISTS audio_storage_path   TEXT,
  ADD COLUMN IF NOT EXISTS source               TEXT DEFAULT 'voice-page',
  ADD COLUMN IF NOT EXISTS os_session_message_id UUID,
  ADD COLUMN IF NOT EXISTS started_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at             TIMESTAMPTZ;

-- Back-fill model on existing rows so the column is queryable
UPDATE voice_transcript_chunks SET model = 'whisper-1' WHERE model IS NULL;

-- Index for future theme/extraction queries: "what did Tate say this week?"
CREATE INDEX IF NOT EXISTS idx_vtc_source_created
  ON voice_transcript_chunks(source, created_at DESC);

COMMENT ON COLUMN voice_transcript_chunks.audio_storage_path IS
  'Path in voice-chunks Supabase storage bucket, e.g. '
  '"2026-05-12/<session_id>/0.webm". NULL when upload failed (best-effort).';

COMMENT ON COLUMN voice_transcript_chunks.model IS
  'Whisper model used for transcription, e.g. "whisper-1". '
  'Retained so chunks can be re-transcribed with a better model later.';

COMMENT ON COLUMN voice_transcript_chunks.source IS
  '"voice-page" (standalone /voice recorder) or "chat-page" '
  '(forthcoming main-chat-integrated recorder). Defaults to "voice-page".';

COMMENT ON COLUMN voice_transcript_chunks.os_session_message_id IS
  'UUID of the os_session_messages row created when this chunk''s text '
  'was forwarded to the conductor. NULL for dropped chunks or when '
  'message-id tracking is not yet wired.';
