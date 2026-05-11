-- ============================================================
-- 099_os_session_messages.sql
-- Persistent log of messages received by the OS session conductor.
-- (12 May 2026)
--
-- source: 'voice' | 'typed' | 'scheduler' | 'tate' (legacy unlabelled)
-- Enables: voice vs typed turn analytics, breadcrumb enrichment,
--          linkage from voice_transcript_chunks.os_session_message_id
--
-- Origin: fork_mp1u0ln7_4a7f94 (W2: voice-source marking brief)
-- Tate verbatim 12 May 2026 09:16 AEST: "we need to differentiate what
-- is my voice and what is typing... they don't say like sent via voice"
-- ============================================================

CREATE TABLE IF NOT EXISTS os_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osm_source_created
  ON os_session_messages (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_osm_created
  ON os_session_messages (created_at DESC);

COMMENT ON TABLE os_session_messages IS
  'Log of every message delivered to the OS session conductor. '
  'source: voice | typed | scheduler | tate (legacy unlabelled).';

COMMENT ON COLUMN os_session_messages.source IS
  'Origin of the message: voice (voiceBuffer flush), typed (Tate keyboard), '
  'scheduler (cron/delayed task), tate (legacy, pre-source-tracking).';
