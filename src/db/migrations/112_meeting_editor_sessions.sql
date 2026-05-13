-- 112_meeting_editor_sessions.sql
-- Phase 1 of Meeting Analysis Editor: chat session + message log tables.
-- Reanalysis columns included here to avoid a later ALTER TABLE in Phase 4.
-- Authored by fork_mp3d5dpn_a2b6b4 (2026-05-13).

CREATE TABLE IF NOT EXISTS meeting_editor_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            uuid NOT NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_active_at        timestamptz NOT NULL DEFAULT now(),
  message_count         int NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'active',

  -- Reanalysis state (Phase 4 uses these; included here to avoid ALTER TABLE later)
  reanalysis_status     text,
  reanalysis_ran_at     timestamptz,
  reanalysis_issues_json jsonb,

  CONSTRAINT meeting_editor_sessions_status_check
    CHECK (status IN ('active', 'closed')),
  CONSTRAINT meeting_editor_sessions_reanalysis_status_check
    CHECK (reanalysis_status IN ('green', 'issues', 'in_flight', NULL))
);

CREATE TABLE IF NOT EXISTS meeting_editor_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES meeting_editor_sessions(id) ON DELETE CASCADE,
  meeting_id  uuid NOT NULL REFERENCES meeting_recordings(id) ON DELETE CASCADE,
  role        text NOT NULL,
  content     text NOT NULL,
  edit_ops    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_editor_messages_role_check
    CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_editor_messages_session
  ON meeting_editor_messages(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_meeting_editor_sessions_meeting
  ON meeting_editor_sessions(meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_editor_sessions_status
  ON meeting_editor_sessions(meeting_id, status)
  WHERE status = 'active';

-- RLS enabled; backend uses service_role key (bypasses RLS)
ALTER TABLE meeting_editor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_editor_messages ENABLE ROW LEVEL SECURITY;
