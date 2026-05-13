-- 115_dashboard_notes: ephemeral ambient notes written by Haiku observer listeners.
-- Notes expire after 24h and are displayed in the dashboard right rail NotesPanel.
-- Origin: fork_mp3ziqzn_34ac39, Phase 11.

CREATE TABLE IF NOT EXISTS dashboard_notes (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listener_name   TEXT        NOT NULL,
  note_text       TEXT        NOT NULL,
  related_entity  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_dashboard_notes_created_at
  ON dashboard_notes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_notes_expires_at
  ON dashboard_notes (expires_at);
